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
4. **Establish the Gate**: Place a sign on the block indicated by `-` and a button on the other `-` block. You can write your gate settings directly on the sign before activating:
    - **Line 1**: `-GateName-` (e.g., `-Alpha-`)
    - **Line 3**: `NetworkName` (e.g., `Public`)
    - **Line 4**: `Flags` (e.g., `AP` for Always-on + Private)
5. **Activate**: Right-click the sign. If formatted correctly, it will instantly establish and activate without any UI menus! (If the sign is blank, it opens a guided setup UI instead).
6. **Use & Rename**: Right-click to cycle destinations and press the button to teleport. **Sneak + Right-click** the sign to open the vanilla sign editor, allowing you to dynamically rename or change networks in real-time!

### Sign Flags (Line 4):
- **`A` (Always-On)**: Permanently active portal blocks. Walk through to go to destination instantly.
- **`R` (Random Gate)**: Permanently active. Teleports entering players to a completely random coordinate location in the world.
- **`H` (Hidden)**: Hides the gate from target dialing/cycling lists on other gates.
- **`P` (Private)**: Locks the gate to its creator. Only the owner can dial or edit this sign.
- **`B` (Backwards Exit)**: Reverses exit momentum, spawning you out the back face of the frame.
- **`Q` (Silent)**: Disables chat logs and portal sound effects during teleports.
- **`N` (Hide Network)**: Replaces the network name on Line 3 with boundaries to hide it from others.
- **`U` (Bungee server link)**: Permanent linkage simulation.

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
