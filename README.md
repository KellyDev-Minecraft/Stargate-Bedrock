# Stargate Bedrock Addon

A Minecraft Bedrock Edition Addon that ports the classic Stargate plugin experience. Build, activate, and use Stargates to travel across your world!

## Features

- **Classic Gate Building**: Build gates block-by-block using traditional layouts.
- **Symmetric Activation**: Both ends of a portal activate and deactivate simultaneously.
- **Bi-directional Teleportation**: Return through a portal to your source without re-dialing.
- **Network Selection**: Advanced UI for selecting existing networks or creating new ones.
- **Gate Options**: Configure gates with options like Hidden, Always On, Private, and more.
- **Edit on the Fly**: Right-click a gate with the Casting Guide to update its configuration.
- **Resilient Database**: Automatic state cleanup and persistent storage via DB entity.

## Installation

1. Download the latest `Stargate.mcaddon` (or `Stargate_vX.X.X.mcaddon`).
2. Open the file to import it into Minecraft Bedrock Edition.
3. Apply the **Behavior Pack** and **Resource Pack** to your world.

## Usage

1. **Get the Casting Guide**: Give yourself the `stargate:plan_book` item.
2. **Choose a Design**: Use the book to select a gate type.
3. **Build the Frame**: follow the holographic guide or the plan in the book.
4. **Setup**: Place a sign on the indicated block and right-click it with the Casting Guide.
5. **Dial**: Cycle targets by tapping the sign, then press the button to activate.
6. **Edit**: Use the Casting Guide on an existing gate's frame or sign to change its name, network, or options.

## Development

### Prerequisites
- Python 3

### Building
Run the build script:
```bash
python3 build.py
```
This will:
1. Increment the addon version.
2. Generate `version.js` for script-side access.
3. Package everything into a `.mcaddon` file.

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
