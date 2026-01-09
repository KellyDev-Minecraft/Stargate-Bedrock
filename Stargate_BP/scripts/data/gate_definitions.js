/**
 * GATE DEFINITION LEGEND:
 * - : Control points (must have exactly two). Indicators for sign/button placement.
 * . : Portal region. Defines the blocks that will become the portal (open/closed).
 * A-Z, etc. : Frame materials. These characters map to block types in the 'materials' object.
 * (Space) : Alignment space. Can be any block; the gate matcher ignores these positions.
 * 
 * DESIGN RULES:
 * 1. Each gate must have exactly two control points ('-').
 * 2. The portal region is defined by '.'.
 * 3. Frame materials can use any single letter (A-Z, X, etc.).
 *
 * PROHIBITED MATERIALS:
 * - minecraft:portal : Unstable/Unusable. Requires exact 4x5 Obsidian frame or breaks/vanishes immediately.
 * - minecraft:soul_fire : Unstable. Requires Soul Sand/Soil below or extinguishes immediately.
 * 
 * RECOMMENDED:
 * Use particles or stained glass panes for portal-open.
 * 
 * POPULAR PARTICLES:
 * - minecraft:basic_flame_particle (Fire/Embers)
 * - minecraft:end_rod (White floating specs, magic looking)
 * - minecraft:dragon_breath_trail (Purple smoke)
 * - minecraft:villager_happy (Green sparkles)
 * - minecraft:totem_particle (Green/Yellow rising energy)
 * - minecraft:electric_spark_particle (Lightning sparks)
 * - minecraft:blue_flame_particle (Blue fire)
 * - minecraft:conduit_particle (Blue/Orange center glow)
 * - minecraft:lava_drip_particle (Falling lava)
 */

export const GateDefinitions = [
    {
        "id": "obsidian",
        "config": {
            "portal-open": "minecraft:dragon_breath_trail",
            "portal-closed": "minecraft:air",
            "button": "minecraft:stone_button"
        },
        "materials": {
            "X": "minecraft:obsidian",
            "-": "minecraft:obsidian"
        },
        "layout": [
            " XX",
            "X..X",
            "-..-",
            "X..X",
            " XX"
        ]
    },
    {
        "id": "wool",
        "config": {
            "portal-open": "minecraft:water",
            "portal-closed": "minecraft:air",
            "button": "minecraft:stone_button"
        },
        "materials": {
            "X": "minecraft:wool",
            "-": "minecraft:wool"
        },
        "layout": [
            "XXXXX",
            "X...X",
            "-...-",
            "X...X",
            "XXXXX"
        ]
    },
    {
        "id": "endgate",
        "config": {
            "portal-open": "minecraft:end_gateway",
            "portal-closed": "minecraft:air",
            "button": "minecraft:birch_button"
        },
        "materials": {
            "X": "minecraft:end_bricks",
            "-": "minecraft:end_bricks"
        },
        "layout": [
            " XX",
            "X..X",
            "-..-",
            "X..X",
            " XX"
        ]
    },
    {
        "id": "squarenetherglowstonegate",
        "config": {
            "portal-open": "minecraft:purple_stained_glass_pane",
            "portal-closed": "minecraft:air",
            "button": "minecraft:oak_button"
        },
        "materials": {
            "X": "minecraft:obsidian",
            "-": "minecraft:glowstone",
            "A": "minecraft:glowstone"
        },
        "layout": [
            " XAX",
            "X...X",
            "-...-",
            "X...X",
            " XAX"
        ]
    },
    {
        "id": "watergate",
        "config": {
            "portal-open": "minecraft:kelp_plant",
            "portal-closed": "minecraft:water",
            "button": "minecraft:brain_coral_wall_fan"
        },
        "materials": {
            "X": "minecraft:sea_lantern",
            "-": "minecraft:sea_lantern"
        },
        "layout": [
            " XX",
            "X..X",
            "-..-",
            "X..X",
            " XX"
        ]
    },
    {
        "id": "fireplace",
        "config": {
            "portal-open": "minecraft:basic_flame_particle",
            "portal-closed": "minecraft:fire",
            "button": "minecraft:polished_blackstone_button"
        },
        "materials": {
            "X": "minecraft:cobblestone",
            "-": "minecraft:cobblestone"
        },
        "layout": [
            " X ",
            "-.-",
            "X.X",
            "XXX"
        ]
    },
    {
        "id": "redstone",
        "config": {
            "portal-open": "minecraft:lava_drip_particle",
            "portal-closed": "minecraft:red_stained_glass_pane",
            "button": "minecraft:stone_button"
        },
        "materials": {
            "X": "minecraft:redstone_block",
            "-": "minecraft:redstone_block"
        },
        "layout": [
            "XXXX",
            "-..-",
            "X..X",
            "XXXX"
        ]
    },
    {
        "id": "lapis",
        "config": {
            "portal-open": "minecraft:blue_flame_particle",
            "portal-closed": "minecraft:blue_stained_glass_pane",
            "button": "minecraft:stone_button"
        },
        "materials": {
            "X": "minecraft:lapis_block",
            "-": "minecraft:lapis_block"
        },
        "layout": [
            "XXXX",
            "-..-",
            "X..X",
            "XXXX"
        ]
    },
    {
        "id": "diamond",
        "config": {
            "portal-open": "minecraft:electric_spark_particle",
            "portal-closed": "minecraft:air",
            "button": "minecraft:stone_button"
        },
        "materials": {
            "X": "minecraft:diamond_block",
            "-": "minecraft:diamond_block"
        },
        "layout": [
            "X-..-X",
            "XX..XX"
        ]
    }
];
