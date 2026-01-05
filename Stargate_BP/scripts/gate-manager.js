import { world, BlockPermutation } from "@minecraft/server";
import { GateDefinitions } from "./data/gate_definitions.js";

export class GateManager {
    static checkAndActivateGate(buttonBlock, player) {
        // 1. Get the block the button is attached to (support wall buttons)
        // For simplicity, let's assume standard face-attached buttons for now or check permutations.
        // Bedrock buttons have "facing_direction" state usually.

        const attachedBlock = this.getAttachedBlock(buttonBlock);
        if (!attachedBlock) {
            console.warn("Could not find attached block for button");
            return;
        }

        player.sendMessage(`Checking gate on ${attachedBlock.typeId}...`);

        for (const gateDef of GateDefinitions) {
            const match = this.matchGatePattern(gateDef, attachedBlock);
            if (match) {
                player.sendMessage(`Gate Pattern Matched: ${gateDef.id}!`);
                this.createGate(match, player);
                return;
            }
        }

        player.sendMessage("No valid gate pattern found.");
    }

    static getAttachedBlock(buttonBlock) {
        // Need to check block states for facing.
        // "facing_direction": 0=down, 1=up, 2=north, 3=south, 4=west, 5=east (Common mappings)
        // Actually "facing_direction" is deprecated or specific. "facing" is string "north", "south", etc.
        const perm = buttonBlock.permutation;
        const facing = perm.getState("facing_direction");

        // Map facing to vector
        // 2=North (z-), 3=South (z+), 4=West (x-), 5=East (x+)
        let dir = { x: 0, y: 0, z: 0 };
        if (facing === 2) dir.z = 1; // If facing north, attached block is to the South (z+)
        else if (facing === 3) dir.z = -1; // If facing south, attached block is to North
        else if (facing === 4) dir.x = 1;
        else if (facing === 5) dir.x = -1;

        return buttonBlock.dimension.getBlock({
            x: buttonBlock.x + dir.x,
            y: buttonBlock.y + dir.y,
            z: buttonBlock.z + dir.z
        });
    }

    static matchGatePattern(gateDef, anchorBlock) {
        // Anchor block corresponds to '-' in the layout.
        // We need to try matching the pattern for every '-' occurrence in the layout.

        const layout = gateDef.layout;
        // Parse layout to find relative coords of '-'
        // Layout is array of strings.
        // Let's assume standard 2D vertical plane.

        // Find all anchor points in layout
        const anchors = [];
        for (let r = 0; r < layout.length; r++) {
            for (let c = 0; c < layout[r].length; c++) {
                if (layout[r][c] === '-') {
                    anchors.push({ r, c });
                }
            }
        }

        // Try both axis (X-aligned and Z-aligned)
        // Axis 1: Gate runs along X axis (constant Z)
        // Axis 2: Gate runs along Z axis (constant X)

        for (const anchor of anchors) {
            // Check Axis X (row changes Y, col changes X)
            if (this.checkMatch(gateDef, anchorBlock, anchor, layout, 'x')) return { gateDef, axis: 'x', anchor, anchorBlock };
            // Check Axis Z (row changes Y, col changes Z)
            if (this.checkMatch(gateDef, anchorBlock, anchor, layout, 'z')) return { gateDef, axis: 'z', anchor, anchorBlock };
        }

        return null;
    }

    static checkMatch(gateDef, worldAnchor, layoutAnchor, layout, axis) {
        // Check every character in layout relative to worldAnchor
        // layoutAnchor {r, c} corresponds to worldAnchor {x,y,z}

        for (let r = 0; r < layout.length; r++) {
            const rowStr = layout[r];
            for (let c = 0; c < rowStr.length; c++) {
                const char = rowStr[c];
                if (char === ' ') continue; // Skip space

                // Calculate relative position
                const dr = layoutAnchor.r - r; // Up/Down from anchor (Row 0 is top usually? Wait. Standard text file: Line 1 is top.)
                // Actually in layout array: index 0 is top line.
                // So r increasing means Y decreasing.

                const dy = (layout.length - 1 - r) - (layout.length - 1 - layoutAnchor.r);
                // Wait, simpler:
                // r_anchor - r  => if r < r_anchor (higher up), dy should be positive?
                // Text:
                // 0:  XX
                // 1: X..X
                // 2: -..-  <-- anchor at r=2
                //
                // block at r=0 is 2 blocks ABOVE block at r=2.
                // So dy = layoutAnchor.r - r

                const dLat = c - layoutAnchor.c; // Lateral difference (along X or Z)

                let targetX = worldAnchor.x;
                let targetY = worldAnchor.y + (layoutAnchor.r - r);
                let targetZ = worldAnchor.z;

                if (axis === 'x') {
                    targetX += dLat;
                } else {
                    targetZ += dLat;
                }

                const block = worldAnchor.dimension.getBlock({ x: targetX, y: targetY, z: targetZ });
                if (!block) return false;

                // Match block type
                if (!this.matchesMaterial(char, block, gateDef)) return false;
            }
        }
        return true;
    }

    static matchesMaterial(char, block, gateDef) {
        // 1. Check if char maps to a material in gateDef
        let expectedMat = gateDef.materials[char];

        // Special chars
        if (char === '-') expectedMat = gateDef.materials['-'];
        // In the format, '-' is also defined in materials map as the frame material.

        if (char === '.') {
            // Portal material (open or closed)
            // When building, it should be portal-closed (AIR usually) or existing portal?
            // Usually we build the frame with AIR inside.
            expectedMat = gateDef.config['portal-closed'];
        }

        if (char === '*') {
            // Exit point - usually matches portal-closed (AIR)
            expectedMat = gateDef.config['portal-closed'];
        }

        if (!expectedMat) {
            // Maybe it is a literal material? (Not in this format)
            return false;
        }

        // expectedMat is "minecraft:obsidian" string
        // block.typeId is "minecraft:obsidian"

        // Handle tags (not supported yet locally, but we cleaned them in python)
        // Handle comma lists?

        // Simple string check
        if (block.typeId === expectedMat) return true;

        // Allow AIR match if we expect AIR
        if (expectedMat === 'minecraft:air' && block.isAir) return true;

        return false;
    }

    static createGate(match, player) {
        // Verification success
        // Fill portal blocks
        // The match object has all the info we need.
        const { gateDef, axis, anchor, anchorBlock } = match;
        const layout = gateDef.layout;
        const portalMat = gateDef.config['portal-open'];

        player.dimension.runCommandAsync(`say Creating ${gateDef.id} Gate!`);

        // Fill the '.' and '*' blocks with portal material
        for (let r = 0; r < layout.length; r++) {
            for (let c = 0; c < layout[r].length; c++) {
                const char = layout[r][c];
                if (char === '.' || char === '*') {
                    const dy = anchor.r - r;
                    const dLat = c - anchor.c;

                    let targetX = anchorBlock.x;
                    let targetY = anchorBlock.y + dy;
                    let targetZ = anchorBlock.z;

                    if (axis === 'x') targetX += dLat;
                    else targetZ += dLat;

                    const block = anchorBlock.dimension.getBlock({ x: targetX, y: targetY, z: targetZ });

                    // Set to portal material
                    // Note: 'minecraft:nether_portal' requires valid axis property or it vanishes?
                    // 'minecraft:water', etc.

                    // Force set
                    // We might need to handle block states for portal axis
                    block.setType(portalMat);
                }
            }
        }
    }
}
