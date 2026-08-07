// Open tray for the 20 mm x 25 mm ESP32-C3 board used by Rearview.
// The USB connector faces the open edge at y = 0.

board_width = 20;
board_length = 25;

wall_thickness = 2;
base_thickness = 2;
wall_height = 6; // Height above the top of the base.
clearance = 0.3; // Clearance on each side and behind the board.

inner_width = board_width + (2 * clearance);
inner_length = board_length + clearance;
outer_width = inner_width + (2 * wall_thickness);
outer_length = inner_length + wall_thickness;

assert(wall_thickness > 0, "wall_thickness must be positive");
assert(base_thickness > 0, "base_thickness must be positive");
assert(wall_height > 0, "wall_height must be positive");
assert(clearance >= 0, "clearance cannot be negative");

union() {
  // Base extends to the open USB edge.
  cube([outer_width, outer_length, base_thickness]);

  // Left and right walls.
  translate([0, 0, base_thickness])
    cube([wall_thickness, outer_length, wall_height]);
  translate([outer_width - wall_thickness, 0, base_thickness])
    cube([wall_thickness, outer_length, wall_height]);

  // Rear wall; there is deliberately no wall at y = 0.
  translate([wall_thickness, outer_length - wall_thickness, base_thickness])
    cube([inner_width, wall_thickness, wall_height]);
}
