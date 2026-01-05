export const GateDefinitions = [
    {
        "id": "nethergate",
        "format_version": "1.0.0",
        "config": {
            "portal-open": "minecraft:nether_portal",
            "portal-closed": "minecraft:air",
            "button": "minecraft:stone_button",
            "toowner": "minecraft:false"
        },
        "materials": {
            "X": "minecraft:obsidian",
            "-": "minecraft:obsidian"
        },
        "layout": [
            " XX",
            "X..X",
            "-..-",
            "X*.X",
            " XX"
        ]
    },
    {
        "id": "wool",
        "format_version": "1.0.0",
        "config": {
            "portal-open": "minecraft:water",
            "portal-closed": "minecraft:air",
            "button": "minecraft:stone_button",
            "toowner": "minecraft:false"
        },
        "materials": {
            "X": "minecraft:wool",
            "-": "minecraft:wool"
        },
        "layout": [
            "XXXXX",
            "X...X",
            "-...-",
            "X.*.X",
            "XXXXX"
        ]
    },
    {
        "id": "endgate",
        "format_version": "1.0.0",
        "config": {
            "portal-open": "minecraft:end_gateway",
            "portal-closed": "minecraft:air",
            "button": "minecraft:birch_button",
            "toowner": "minecraft:false"
        },
        "materials": {
            "X": "minecraft:end_stone_bricks",
            "-": "minecraft:end_stone_bricks"
        },
        "layout": [
            " XX",
            "X..X",
            "-..-",
            "X*.X",
            " XX"
        ]
    },
    {
        "id": "squarenetherglowstonegate",
        "format_version": "1.0.0",
        "config": {
            "portal-open": "minecraft:nether_portal",
            "portal-closed": "minecraft:air",
            "button": "minecraft:oak_button",
            "toowner": "minecraft:false"
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
            "X.*.X",
            " XAX"
        ]
    },
    {
        "id": "watergate",
        "format_version": "1.0.0",
        "config": {
            "portal-open": "minecraft:kelp_plant",
            "portal-closed": "minecraft:water",
            "button": "minecraft:brain_coral_wall_fan",
            "toowner": "minecraft:false"
        },
        "materials": {
            "X": "minecraft:sea_lantern",
            "-": "minecraft:sea_lantern"
        },
        "layout": [
            " XX",
            "X..X",
            "-..-",
            "X*.X",
            " XX"
        ]
    }
];