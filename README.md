# Stargate Bedrock Addon

A Minecraft Bedrock Edition Addon that ports the classic Stargate plugin experience. Build, activate, and use Stargates to travel across your world!

## Features

- **Classic Gate Building**: Build gates block-by-block using traditional layouts.
- **Symmetric Activation**: Both ends of a portal activate and deactivate simultaneously.
- **Bi-directional Teleportation**: Return through a portal to your source without re-dialing.
- **Sign-Based Setup & Configuration**: Establish gates without any menus. Define the name, network, and options by writing directly on the sign before activation.
- **Vanilla Sign Editing**: Sneak-right-click an existing sign to open the vanilla editor and dynamically rename gates or change networks in real-time.
- **Rich Flag Options**: Configure gates with flags on the sign's 4th line (e.g., Always-On, Private, Hidden, Backward Exit, Silent, and more).
- **Resilient Database**: Automatic state cleanup and persistent storage via DB entity.

## Installation

1. Download the latest `Stargate.mcaddon` (or `Stargate_vX.X.X.mcaddon`).
2. Open the file to import it into Minecraft Bedrock Edition.
3. Apply the **Behavior Pack** and **Resource Pack** to your world.

## Usage

1. **Get the Casting Guide**: Give yourself the `stargate:plan_book` item.
2. **Choose a Design**: Sneak + right-click with the book to display the guide and plans.
3. **Build the Frame**: Follow the holographic guide or the plan in the book.
4. **Format the Sign**: Place a sign on the block indicated by `-` and write its details directly on it:
   - **Line 1**: `-GateName-` (e.g., `-Alpha-`)
   - **Line 3**: `NetworkName` (e.g., `Public`)
   - **Line 4**: `Flags` (optional, e.g., `AP` for Always-on + Private)
5. **Place Button**: Place a button on the other control block (`-`).
6. **Establish**: Right-click the sign. If formatted correctly, it establishes instantly with zero menus! (Right-clicking a blank sign prints the formatting guide to chat).
7. **Dial**: Right-click the sign to cycle destinations on the network, then press the button to activate the portal.
8. **Edit**: Sneak + Right-Click the sign to open the vanilla sign editor, update the text (names, networks, or flags), and right-click again to save changes to the database instantly.

### Sign Flags (Line 4):
- **`A` (Always-On)**: Permanently active portal blocks. Walk through to go to destination instantly.
- **`R` (Random Gate)**: Permanently active. Teleports entering players to a completely random coordinate location in the world.
- **`H` (Hidden)**: Hides the gate from target dialing/cycling lists on other gates.
- **`P` (Private)**: Locks the gate to its creator. Only the owner can dial or edit this sign.
- **`B` (Backwards Exit)**: Reverses exit momentum, spawning you out the back face of the frame.
- **`Q` (Silent)**: Disables chat logs and portal sound effects during teleports.
- **`N` (Hide Network)**: Replaces the network name on Line 3 with boundaries to hide it from others.
- **`U` (Always-On Direct Link)**: A permanent direct connection between two specific gates.

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
