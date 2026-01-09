# Stargate Bedrock Addon

A Minecraft Bedrock Edition Addon that ports the classic Stargate plugin experience. Build, activate, and use Stargates to travel across your world!

## Features

- **Classic Gate Building**: Build gates block-by-block using traditional layouts (e.g. Obsidian Nether Gate).
- **Gate Detection**: The addon automatically detects valid gate frames when you push the button.
- **Visuals**: Portals fill with blocks (Nether Portal, Water, etc.) or **Particle Effects** upon activation.
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
1. Increment the addon version.
2. Update the addon version based on the git commit count.
3. Package everything into `Stargate_v1.1.X.mcaddon`.

### Adding Custom Gates
1. Open `Stargate_BP/scripts/data/gate_definitions.js`.
2. Add a new object to the `GateDefinitions` array:
    ```javascript
    {
        "id": "my_custom_gate",
        "config": {
            "portal-open": "minecraft:energy_swirl_particle",
            "portal-closed": "minecraft:air",
            "button": "minecraft:stone_button"
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

### Material Constraints
> [!WARNING]
> Certain blocks are **prohibited** for use in `portal-open` because they are physically unstable and will break immediately when placed by scripts:
> - `minecraft:portal` (Nether Portal Block): Requires exact 4x5 Obsidian frame.
> - `minecraft:soul_fire`: Requires Soul Sand/Soil below.
> - `minecraft:fire`: Extinguishes quickly.
>
> **Recommended**: Use Particle IDs (e.g. `minecraft:end_rod`, `minecraft:basic_flame_particle`) or decorative blocks (Glass, Ice, etc.) instead.
3. Re-run `python3 build.py`.

## License
[GNU Lesser General Public License Version 3.0](LICENSE.LESSER)
