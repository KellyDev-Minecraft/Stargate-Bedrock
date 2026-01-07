# Stargate Bedrock Addon

A Minecraft Bedrock Edition Addon that ports the classic Stargate plugin experience. Build, activate, and use Stargates to travel across your world!

## Features

- **Classic Gate Building**: Build gates block-by-block using traditional layouts (e.g. Obsidian Nether Gate).
- **Gate Detection**: The addon automatically detects valid gate frames when you push the button.
- **Visuals**: Portals fill with blocks (Nether Portal, Water, etc.) upon activation.
- **Gate Plans Book**: An in-game manual ("Stargate Casting Guide") that shows you exactly how to build every available gate type.
- **Customizable**: Add your own gate designs via JSON configuration.

## Installation

1. Download the latest `Stargate.mcaddon` (or `Stargate_vX.X.X.mcaddon`).
2. Open the file to import it into Minecraft Bedrock Edition.
3. Apply the **Behavior Pack** and **Resource Pack** to your world.

## Usage

1. **Get the Casting Guide**: Give yourself the `stargate:plan_book` item or search for "Stargate Casting Guide" in the Creative inventory.
2. **Choose a Design**: Use the book to select a gate type (e.g., "nethergate").
3. **Build the Frame**: Follow the plan shown in the book.
    - `X`: Frame Material
    - `-`: Frame Material where the Button/Sign goes
    - `.`: Empty space (will become portal)
4. **Activate**: Place a button on the block indicated by `-` and press it.
5. **Teleport**: (Coming Soon) Walk through to be transported to another gate.

## Development

### Prerequisites
- Python 3

### Building
Run the build script from the project root:
```bash
python3 build_addon.py
```
This will:
1. Merge all gate definitions from `gate_definitions/` into the Behavior Pack.
2. Update the addon version based on the git commit count.
3. Package everything into `Stargate_v1.0.X.mcaddon`.

### Adding Custom Gates
1. Create a new `.json` file in `gate_definitions/`.
2. Follow the format:
    ```json
    {
        "id": "my_custom_gate",
        "format_version": "1.0.0",
        "config": {
            "portal-open": "minecraft:diamond_block",
            "portal-closed": "minecraft:air"
        },
        "materials": {
            "X": "minecraft:gold_block",
            "-": "minecraft:gold_block"
        },
        "layout": [
            " X ",
            "-.-",
            " X "
        ]
    }
    ```
3. Re-run `python3 build_addon.py`.

## License
[GNU Lesser General Public License Version 3.0](LICENSE.LESSER)
