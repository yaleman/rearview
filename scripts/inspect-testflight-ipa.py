#!/usr/bin/env python3

import argparse
import datetime
import plistlib
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path


class InspectionFailure(Exception):
    pass


def load_plist_bytes(payload: bytes, description: str) -> dict:
    try:
        value = plistlib.loads(payload)
    except plistlib.InvalidFileException as error:
        raise InspectionFailure(f"invalid {description} property list") from error
    if not isinstance(value, dict):
        raise InspectionFailure(f"{description} property list is not a dictionary")
    return value


def load_plist(path: Path, description: str) -> dict:
    try:
        return load_plist_bytes(path.read_bytes(), description)
    except OSError as error:
        raise InspectionFailure(f"could not read {description}") from error


def run_checked(arguments: list[str]) -> bytes:
    try:
        result = subprocess.run(arguments, check=True, capture_output=True)
    except (OSError, subprocess.CalledProcessError) as error:
        raise InspectionFailure(f"command failed: {arguments[0]}") from error
    return result.stdout


def require_distribution_entitlements(
    entitlements: dict, *, application_identifier: str, source: str
) -> None:
    if entitlements.get("application-identifier") != application_identifier:
        raise InspectionFailure(f"{source} application identifier does not match")
    if entitlements.get("get-task-allow") is not False:
        raise InspectionFailure(f"{source} unexpectedly permits debugging")


def inspect_ipa(
    ipa: Path, *, team: str, bundle_identifier: str, version: str, build: str
) -> None:
    application_identifier = f"{team}.{bundle_identifier}"
    with tempfile.TemporaryDirectory(prefix="rearview-testflight-ipa.") as directory:
        destination = Path(directory)
        try:
            with zipfile.ZipFile(ipa) as archive:
                archive.extractall(destination)
        except (OSError, zipfile.BadZipFile) as error:
            raise InspectionFailure("invalid IPA archive") from error

        applications = list((destination / "Payload").glob("*.app"))
        if len(applications) != 1:
            raise InspectionFailure("IPA must contain exactly one application")
        app = applications[0]
        info = load_plist(app / "Info.plist", "application Info.plist")
        if info.get("CFBundleIdentifier") != bundle_identifier:
            raise InspectionFailure("IPA bundle identifier does not match")
        if info.get("CFBundleShortVersionString") != version:
            raise InspectionFailure("IPA marketing version does not match")
        if info.get("CFBundleVersion") != build:
            raise InspectionFailure("IPA build number does not match")

        run_checked(["codesign", "--verify", "--deep", "--strict", str(app)])
        signed_entitlements = load_plist_bytes(
            run_checked(["codesign", "-d", "--entitlements", ":-", str(app)]),
            "signed entitlements",
        )
        require_distribution_entitlements(
            signed_entitlements,
            application_identifier=application_identifier,
            source="signed application",
        )

        profile = load_plist_bytes(
            run_checked(
                ["security", "cms", "-D", "-i", str(app / "embedded.mobileprovision")]
            ),
            "embedded provisioning profile",
        )
        if profile.get("ProvisionsAllDevices") is True or "ProvisionedDevices" in profile:
            raise InspectionFailure("embedded profile is not an App Store profile")
        team_identifiers = profile.get("TeamIdentifier")
        if not isinstance(team_identifiers, list) or team not in team_identifiers:
            raise InspectionFailure("embedded profile team does not match")
        profile_entitlements = profile.get("Entitlements")
        if not isinstance(profile_entitlements, dict):
            raise InspectionFailure("embedded profile has no entitlements")
        require_distribution_entitlements(
            profile_entitlements,
            application_identifier=application_identifier,
            source="embedded profile",
        )
        expiration = profile.get("ExpirationDate")
        if not isinstance(expiration, datetime.datetime):
            raise InspectionFailure("embedded profile has no expiration date")
        if expiration.replace(tzinfo=datetime.timezone.utc) <= datetime.datetime.now(
            datetime.timezone.utc
        ):
            raise InspectionFailure("embedded profile has expired")

    print(f"TestFlight IPA inspection passed for Rearview {version} ({build}).")


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ipa", required=True, type=Path)
    parser.add_argument("--team", required=True)
    parser.add_argument("--bundle-id", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--build", required=True)
    return parser.parse_args()


def main() -> int:
    arguments = parse_arguments()
    try:
        inspect_ipa(
            arguments.ipa,
            team=arguments.team,
            bundle_identifier=arguments.bundle_id,
            version=arguments.version,
            build=arguments.build,
        )
    except InspectionFailure as error:
        print(f"TestFlight IPA inspection failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
