import { world, BlockPermutation, system } from "@minecraft/server";
import { GateDefinitions } from "./data/gate_definitions.js";
import { ModalFormData, ActionFormData } from "@minecraft/server-ui";

export class GateManager {
    // --- SIGN BASED CREATION ---
    static checkAndCreateGateFromSign(signBlock, player) {
        console.warn("GateManager.checkAndCreateGateFromSign called");
        // The sign is placed on the frame (usually). 
        // We need to check the block BEHIND the sign (attached block).
        const attachedBlock = this.getAttachedBlock(signBlock);
        if (!attachedBlock) {
            console.warn("Could not find attached block");
            return;
        }

        console.warn(`Checking gate pattern on ${attachedBlock.typeId} attached to sign at ${signBlock.location.x}`);

        for (const gateDef of GateDefinitions) {
            const match = this.matchGatePattern(gateDef, attachedBlock);
            if (match) {
                // Show Setup UI
                this.showSetupUI(match, player, signBlock);
                return;
            }
        }

        // No match found
        player.sendMessage("No valid gate pattern found.");
    }

    // --- SIGN BASED INTERACTION ---
    static handleSignInteraction(signBlock, player) {
        console.warn("handleSignInteraction called");
        const gate = this.findGateBySign(signBlock);
        if (!gate) {
            console.warn("handleSignInteraction: No gate found for this sign.");
            return;
        }

        // Find existing priming for this player and gate
        let prime = this.primedGates.find(p => p.player.id === player.id && p.source.location.x === gate.location.x && p.source.location.y === gate.location.y && p.source.location.z === gate.location.z);

        if (!prime) {
            // First time tapping: Start Priming
            console.warn(`Starting priming for ${gate.name}`);
            const allGates = this.getAllGatesMap();
            const targets = Object.values(allGates).filter(g => g.network === gate.network && g.name !== gate.name);

            if (targets.length === 0) {
                player.sendMessage(`No other gates found on network '${gate.network}'.`);
                return;
            }

            prime = {
                source: gate,
                targets: targets,
                selectedTargetIndex: 0,
                player: player,
                ticksLeft: 100 // 5 seconds
            };
            this.primedGates.push(prime);
        } else {
            // Subsequent tap: Cycle Target
            prime.selectedTargetIndex = (prime.selectedTargetIndex + 1) % prime.targets.length;
            prime.ticksLeft = 100; // Reset timer
            console.warn(`Cycling target for ${gate.name} to index ${prime.selectedTargetIndex}`);
        }

        // Update sign text
        const targetNames = prime.targets.map(t => t.name);
        this.setSignText(gate.signLocation, gate.name, gate.network, [gate.name, ...targetNames], prime.selectedTargetIndex);
    }

    static findGateBySign(signBlock) {
        // console.warn(`findGateBySign looking at ${signBlock.x},${signBlock.y},${signBlock.z}`);
        const allGates = this.getAllGatesMap();
        for (const key in allGates) {
            const gate = allGates[key];
            if (gate.signLocation &&
                gate.signLocation.x === signBlock.x &&
                gate.signLocation.y === signBlock.y &&
                gate.signLocation.z === signBlock.z) {
                return gate;
            }
        }
        return null;
    }

    static findGateByBlock(block) {
        const allGates = this.getAllGatesMap();
        for (const key in allGates) {
            const gate = allGates[key];
            const dimId = block.dimension.id;

            // Check sign
            if (gate.signLocation &&
                gate.signLocation.x === block.x &&
                gate.signLocation.y === block.y &&
                gate.signLocation.z === block.z &&
                gate.signLocation.dim === dimId) {
                return { key, gate };
            }

            // Check frame
            if (gate.frameBlocks) {
                const isFrame = gate.frameBlocks.some(fb =>
                    fb.x === block.x && fb.y === block.y && fb.z === block.z && gate.location.dim === dimId
                );
                if (isFrame) return { key, gate };
            }
        }
        return null;
    }

    static getAttachedBlock(buttonBlock) {
        // Need to check block states for facing.
        // "facing_direction": 0=down, 1=up, 2=north, 3=south, 4=west, 5=east (Common mappings)
        // Actually "facing_direction" is deprecated or specific. "facing" is string "north", "south", etc.
        const perm = buttonBlock.permutation;
        let dir = { x: 0, y: 0, z: 0 };

        // Try modern string "facing" first (north, south, east, west)
        const facingStr = perm.getState("facing");
        if (facingStr) {
            switch (facingStr) {
                case "north": dir.z = 1; break; // Attached to block at South (z+)
                case "south": dir.z = -1; break; // Attached to block at North (z-)
                case "west": dir.x = 1; break;  // Attached to block at East (x+)
                case "east": dir.x = -1; break; // Attached to block at West (x-)
            }
        }
        // Fallback to integer "facing_direction" (2-5)
        else {
            const facingEnv = perm.getState("facing_direction");
            if (facingEnv !== undefined) {
                if (facingEnv === 2) dir.z = 1;
                else if (facingEnv === 3) dir.z = -1;
                else if (facingEnv === 4) dir.x = 1;
                else if (facingEnv === 5) dir.x = -1;
            }
        }

        return buttonBlock.dimension.getBlock({
            x: buttonBlock.x + dir.x,
            y: buttonBlock.y + dir.y,
            z: buttonBlock.z + dir.z
        });
    }

    static matchGatePattern(gateDef, anchorBlock) {
        const layout = gateDef.layout;
        const anchorsInLayout = [];
        for (let r = 0; r < layout.length; r++) {
            for (let c = 0; c < layout[r].length; c++) {
                if (layout[r][c] === '-') {
                    anchorsInLayout.push({ r, c });
                }
            }
        }

        for (const layoutAnchor of anchorsInLayout) {
            // Check Axis X
            if (this.checkMatch(gateDef, anchorBlock, layoutAnchor, layout, 'x')) {
                return {
                    gateDef,
                    axis: 'x',
                    matchedAnchor: layoutAnchor,
                    anchorBlock,
                    allAnchors: this.getAllWorldAnchors(gateDef, anchorBlock, layoutAnchor, 'x')
                };
            }
            // Check Axis Z
            if (this.checkMatch(gateDef, anchorBlock, layoutAnchor, layout, 'z')) {
                return {
                    gateDef,
                    axis: 'z',
                    matchedAnchor: layoutAnchor,
                    anchorBlock,
                    allAnchors: this.getAllWorldAnchors(gateDef, anchorBlock, layoutAnchor, 'z')
                };
            }
        }

        return null;
    }

    static getAllWorldAnchors(gateDef, worldMatchedAnchor, layoutMatchedAnchor, axis) {
        const layout = gateDef.layout;
        const anchors = [];
        for (let r = 0; r < layout.length; r++) {
            for (let c = 0; c < layout[r].length; c++) {
                if (layout[r][c] === '-') {
                    const dy = layoutMatchedAnchor.r - r;
                    const dLat = c - layoutMatchedAnchor.c;

                    let targetX = worldMatchedAnchor.x;
                    let targetY = worldMatchedAnchor.y + dy;
                    let targetZ = worldMatchedAnchor.z;

                    if (axis === 'x') targetX += dLat;
                    else targetZ += dLat;

                    anchors.push({ x: targetX, y: targetY, z: targetZ, dim: worldMatchedAnchor.dimension.id });
                }
            }
        }
        return anchors;
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
                if (!this.matchesMaterial(char, block, gateDef)) {
                    // console.warn(`Match failed at rel ${dLat},${dy}: expected ${char}, got ${block.typeId}`);
                    return false;
                }
            }
        }
        return true;
    }

    static matchesMaterial(char, block, gateDef) {
        // 1. Check if char maps to a material in gateDef
        let expectedMat = gateDef.materials[char];

        // Special chars
        if (char === '-') expectedMat = gateDef.materials['-'];

        if (char === '.') {
            // Portal material (open or closed)
            expectedMat = gateDef.config['portal-closed'];
        }

        if (!expectedMat) {
            return false;
        }

        const blockId = block.typeId;
        const expectedId = expectedMat.replace('minecraft:', '');

        if (blockId.includes(expectedId)) return true;

        // Special case: if it's the '.' (portal), allow portal-open material too
        if (char === '.') {
            const openMat = gateDef.config['portal-open'];
            if (blockId === openMat || blockId.includes(openMat.replace('minecraft:', ''))) return true;
        }

        // Allow AIR match if we expect AIR
        if (expectedMat === 'minecraft:air' && block.isAir) return true;

        return false;
    }


    static setSignText(loc, name, network, targets, selectedIndex = -1, isActive = false) {
        const dim = world.getDimension(loc.dim);
        if (!dim) return;
        const block = dim.getBlock(loc);
        if (!block) return;

        const sign = block.getComponent("minecraft:sign");
        if (sign) {
            let text = "";
            const targetList = targets.filter(t => t !== name);

            if (isActive) {
                // Active Portal State
                const dest = targets[0] || "Unknown";
                text = `§1-${name}-\n§c>> ACTIVE <<\n§4${dest}`;
            } else if (selectedIndex === -1) {
                // Default State
                text = `§1-${name}-\n§8------------\n§3${network}`;
            } else {
                // Primed/Selection State
                text = `§1-${name}-\n`;
                if (targetList.length > 0) {
                    const idx = selectedIndex % targetList.length;
                    const selectedName = targetList[idx];
                    text += `§0<${selectedName}>\n`;

                    if (targetList.length > 1) {
                        const nextName = targetList[(idx + 1) % targetList.length];
                        text += `§8${nextName}\n`;
                    }
                    if (targetList.length > 2) {
                        const nextName = targetList[(idx + 2) % targetList.length];
                        text += `§8${nextName}`;
                    }
                } else {
                    text += "§4(No Targets)";
                }
            }
            sign.setText(text);
        }
    }

    static async showDialUI(activeGate, player) {
        console.warn(`showDialUI for ${activeGate.name} (${activeGate.network})`);
        const allGateKeys = this.getAllGates();
        const targets = [];

        for (const key of allGateKeys) {
            // Skip self
            if (activeGate.location && key === this.getGateKey({ dimension: { id: activeGate.location.dim }, x: activeGate.location.x, y: activeGate.location.y, z: activeGate.location.z })) continue;

            const gate = this.getGateData(key);
            if (gate && gate.network === activeGate.network) {
                targets.push(gate);
            }
        }

        console.warn(`Found ${targets.length} targets on network '${activeGate.network}'`);

        if (targets.length === 0) {
            player.sendMessage(`No other gates found on network '${activeGate.network}'.`);
            return;
        }

        const form = new ActionFormData()
            .title(`Dial from ${activeGate.name}`)
            .body(`Choose a destination on the '${activeGate.network}' network.`);

        for (const target of targets) {
            form.button(`${target.name}\n${target.location.dim.replace('minecraft:', '')}`);
        }

        console.warn("Showing Dial UI form...");
        const response = await form.show(player);
        if (response.canceled) {
            console.warn(`Dial UI canceled by ${player.name}`);
            return;
        }

        const targetGate = targets[response.selection];
        console.warn(`User selected target: ${targetGate.name}`);
        this.primeGate(activeGate, targetGate, player);
    }

    static primedGates = []; // { source, targets, selectedTargetIndex, player, ticksLeft }



    static handleButtonInteraction(buttonBlock, player) {
        console.warn(`handleButtonInteraction: Button pressed at ${buttonBlock.x}, ${buttonBlock.y}, ${buttonBlock.z} by ${player.name} at ${Math.floor(player.location.x)}, ${Math.floor(player.location.y)}, ${Math.floor(player.location.z)}`);

        // Find if this button belongs to a primed gate for this player
        console.warn(`Checking ${this.primedGates.length} primed gates...`);
        const primeIdx = this.primedGates.findIndex(p => {
            if (p.player.id !== player.id) {
                console.warn(`  - Skip: player mismatch (${p.player.id} vs ${player.id})`);
                return false;
            }
            if (!p.source.buttonLocation) {
                console.warn(`  - Skip: gate ${p.source.name} has no buttonLocation data`);
                return false;
            }
            const b = p.source.buttonLocation;
            const matches = b.x === buttonBlock.x && b.y === buttonBlock.y && b.z === buttonBlock.z && b.dim === buttonBlock.dimension.id;
            console.warn(`  - Checking ${p.source.name} button at ${b.x},${b.y},${b.z} (${b.dim}): ${matches ? "MATCH" : "NO MATCH"}`);
            return matches;
        });

        if (primeIdx !== -1) {
            const prime = this.primedGates[primeIdx];
            const targetGate = prime.targets[prime.selectedTargetIndex];
            console.warn(`[SUCCESS] Matching prime found! Activating gate ${prime.source.name} -> ${targetGate.name}`);
            this.activateGate(prime.source, targetGate, player);
            this.primedGates.splice(primeIdx, 1);
        } else {
            console.warn("[FAILURE] No primed gate matches this button interaction.");
            // Check if it's a general gate button to remind player
            const allGates = this.getAllGatesMap();
            const gate = Object.values(allGates).find(g => {
                if (!g.buttonLocation) return false;
                return g.buttonLocation.x === buttonBlock.x &&
                    g.buttonLocation.y === buttonBlock.y &&
                    g.buttonLocation.z === buttonBlock.z &&
                    g.buttonLocation.dim === buttonBlock.dimension.id;
            });
            if (gate) {
                console.warn(`Matches physical button for gate: ${gate.name}. Informing player.`);
                player.sendMessage("§7Select a destination on the sign first.");
            } else {
                console.warn("This button is not registered to any known gate.");
            }
        }
    }

    // Active portals list: { sourceKey, targetGate, timeout }
    static activePortals = [];

    static activateGate(sourceGate, targetGate, player) {
        console.warn(`Activating gate ${sourceGate.name} -> ${targetGate.name}`);

        // 1. Fill portal blocks
        this.setPortalBlocks(sourceGate, true);

        this.activePortals.push({
            gate: sourceGate,
            target: targetGate,
            ticksRemaining: 100 // 5 seconds (as per user's 100 tick edit)
        });

        // 2. Update Sign to show active destination
        if (sourceGate.signLocation) {
            this.setSignText(sourceGate.signLocation, sourceGate.name, sourceGate.network, [targetGate.name], 0, true);
        }

        player.sendMessage(`§aGate Active! Destination: ${targetGate.name}`);
    }

    static setPortalBlocks(gate, isOpen) {
        if (!gate.portalBlocks) {
            console.warn(`setPortalBlocks: No portalBlocks for gate ${gate.name}`);
            return;
        }
        const dim = world.getDimension(gate.location.dim);
        if (!dim) return;

        // Try to get materials from the current gate definition first
        const gateDef = GateDefinitions.find(d => d.id === gate.id);
        let openMat = "minecraft:portal";
        let closedMat = "minecraft:air";

        if (gateDef && gateDef.config) {
            openMat = gateDef.config['portal-open'] || openMat;
            closedMat = gateDef.config['portal-closed'] || closedMat;
        } else {
            // Fallback to stored properties if definition not found
            openMat = gate.portalOpenMat || openMat;
            closedMat = gate.portalClosedMat || closedMat;
        }

        console.warn(`setPortalBlocks: ${gate.name} -> ${isOpen ? "OPEN" : "CLOSED"} (${gate.portalBlocks.length} blocks)`);
        let blockType = isOpen ? openMat : closedMat;

        // Bedrock portal block handling
        if (isOpen && blockType === "minecraft:nether_portal") blockType = "minecraft:portal";

        for (const pb of gate.portalBlocks) {
            try {
                const block = dim.getBlock(pb);
                if (block) {
                    const permutation = BlockPermutation.resolve(blockType);

                    if (isOpen && blockType === "minecraft:portal") {
                        const axis = gate.axis === 'x' ? 'x' : 'z';
                        try {
                            block.setPermutation(BlockPermutation.resolve(blockType, { "portal_axis": axis }));
                        } catch (e) {
                            block.setPermutation(permutation);
                        }
                    } else {
                        block.setPermutation(permutation);
                    }
                }
            } catch (e) {
                console.warn(`  - Error setting block at ${pb.x}, ${pb.y}, ${pb.z}: ${e}`);
            }
        }
    }

    static tickCounter = 0;
    static tick() {
        this.tickCounter++;
        if (this.tickCounter % 100 === 0) {
            console.warn(`GateManager Tick Heartbeat (Active: ${this.activePortals.length}, Primed: ${this.primedGates.length})`);
        }

        // 1. Handle Primed Gates (Sign touched, waiting for button)
        if (this.primedGates.length > 0) {
            for (let i = this.primedGates.length - 1; i >= 0; i--) {
                const p = this.primedGates[i];
                p.ticksLeft--;
                if (p.ticksLeft <= 0) {
                    console.warn(`Priming for ${p.source.name} expired.`);

                    // Revert sign text
                    if (p.source.signLocation) {
                        this.setSignText(p.source.signLocation, p.source.name, p.source.network, [p.source.name]);
                    }

                    p.player.sendMessage(`§cActivation window for ${p.source.name} expired.`);
                    this.primedGates.splice(i, 1);
                }
            }
        }

        // 2. Handle Active Portals
        if (this.activePortals.length > 0) {
            for (let i = this.activePortals.length - 1; i >= 0; i--) {
                const ap = this.activePortals[i];
                ap.ticksRemaining--;

                // Frame Integrity Check
                let frameIntact = true;
                if (ap.gate.frameBlocks) {
                    const dim = world.getDimension(ap.gate.location.dim);
                    if (dim) {
                        for (const fb of ap.gate.frameBlocks) {
                            try {
                                const block = dim.getBlock(fb);
                                if (!block || block.isAir || block.isLiquid) {
                                    console.warn(`Frame integrity failure for ${ap.gate.name} at ${fb.x}, ${fb.y}, ${fb.z}`);
                                    frameIntact = false;
                                    break;
                                }
                            } catch (e) { }
                        }
                    }
                }

                if (!frameIntact || ap.ticksRemaining <= 0) {
                    console.warn(`Closing portal ${ap.gate.name} (Intact: ${frameIntact}, Ticks: ${ap.ticksRemaining})`);
                    this.setPortalBlocks(ap.gate, false);

                    // Revert sign to default
                    if (ap.gate.signLocation) {
                        this.setSignText(ap.gate.signLocation, ap.gate.name, ap.gate.network, []);
                    }

                    this.activePortals.splice(i, 1);
                    continue;
                }

                // Teleportation Logic
                const dim = world.getDimension(ap.gate.location.dim);
                if (dim) {
                    const players = dim.getPlayers({ location: ap.gate.location, maxDistance: 8 });
                    for (const p of players) {
                        const pLoc = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
                        const isInPortal = ap.gate.portalBlocks.some(pb => pb.x === pLoc.x && pb.y === pLoc.y && pb.z === pLoc.z);
                        if (isInPortal) {
                            this.teleportPlayer(p, ap.target);
                        }
                    }
                }
            }
        }
    }

    static recentTeleports = new Map(); // playerId -> timestamp

    static teleportPlayer(player, targetGate) {
        const now = Date.now();
        const lastTeleport = this.recentTeleports.get(player.id) || 0;
        if (now - lastTeleport < 1000) return; // 1 second cooldown

        const dim = world.getDimension(targetGate.location.dim);
        if (!dim) return;

        this.recentTeleports.set(player.id, now);

        // Use portalCenter if available, otherwise fallback to location
        let baseLoc = targetGate.portalCenter || targetGate.location;
        let tx = baseLoc.x + 0.5;
        let ty = baseLoc.y;
        let tz = baseLoc.z + 0.5;
        let rotY = 0;

        // Apply exit direction offset (usually 1.5 blocks out from center)
        if (targetGate.exitDirection) {
            tx += targetGate.exitDirection.x * 1.5;
            ty += targetGate.exitDirection.y;
            tz += targetGate.exitDirection.z * 1.5;
            rotY = targetGate.exitDirection.rotY || 0;
        } else {
            // Legacy fallback
            if (targetGate.axis === 'x') {
                tz += 2.0;
                rotY = 0; // Face South
            } else {
                tx += 2.0;
                rotY = 90; // Face West
            }
        }

        try {
            console.warn(`Teleporting ${player.name} to center of ${targetGate.name} at ${tx.toFixed(2)}, ${ty}, ${tz.toFixed(2)} facing ${rotY}`);

            // Print frame positions for debugging
            if (targetGate.frameBlocks && targetGate.frameBlocks.length > 0) {
                console.warn(`Target gate frame blocks (${targetGate.frameBlocks.length}):`);
                targetGate.frameBlocks.forEach((fb, i) => {
                    console.warn(`  [${i}] ${fb.x}, ${fb.y}, ${fb.z}`);
                });
            }

            player.teleport({ x: tx, y: ty, z: tz }, { dimension: dim, rotation: { x: 0, y: rotY } });
        } catch (e) {
            console.warn(`Teleport failed: ${e}`);
        }
    }

    static getGateKey(block) {
        return `sg_${block.dimension.id}_${block.x}_${block.y}_${block.z}`;
    }

    static getGateData(key) {
        const allGates = this.getAllGatesMap();
        return allGates[key] || null;
    }

    static saveGateData(key, data) {
        const db = this.getDatabaseEntity();
        if (!db) {
            console.warn("Failed to save gate data: DB Entity not found/created.");
            return;
        }

        // Clean up old tags for this key
        // We match "gate:KEY" prefix. 
        // Old format: gate:KEY|JSON
        // New format: gate:KEY|i|total|JSON_CHUNK
        const prefix = `gate:${key}|`;
        const tags = db.getTags();
        for (const tag of tags) {
            if (tag.startsWith(prefix)) {
                db.removeTag(tag);
            }
        }

        const json = JSON.stringify(data);
        const MAX_TAG_LEN = 250; // Safety margin below 255
        // We need to reserve space for prefix: "gate:KEY|i|total|"
        // Approx overhead: 5 ("gate:") + 30 (key) + 1 ("|") + 2 (index) + 1 ("|") + 2 (total) + 1 ("|") = ~42 chars.
        // Let's assume safe payload size of 200 chars.
        const CHUNK_SIZE = 200;

        const totalChunks = Math.ceil(json.length / CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
            const chunk = json.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            // Format: gate:KEY|index|total|data
            const tag = `gate:${key}|${i}|${totalChunks}|${chunk}`;
            if (tag.length > 255) {
                console.warn(`Critical: Generated tag exceeds limit! Length: ${tag.length}`);
            }
            db.addTag(tag);
        }
        console.warn(`Saved gate data for ${key} in ${totalChunks} chunks.`);
    }

    static getAllGatesMap() {
        const db = this.getDatabaseEntity();
        if (!db) return {};

        const gates = {};
        const fragments = {}; // Map<key, Array<string>>

        const tags = db.getTags();
        for (const tag of tags) {
            if (tag.startsWith("gate:")) {
                try {
                    // format: gate:KEY|index|total|data
                    // split by '|'
                    const parts = tag.split('|');
                    if (parts.length < 4) continue;

                    // gate:KEY is parts[0]
                    const key = parts[0].substring(5); // remove "gate:"
                    const index = parseInt(parts[1]);
                    const total = parseInt(parts[2]);
                    // data is everything after the 3rd pipe. 
                    // Using split means data containing | might be split. Join back.
                    const data = parts.slice(3).join('|');

                    if (!fragments[key]) {
                        fragments[key] = new Array(total).fill("");
                    }
                    fragments[key][index] = data;
                } catch (e) {
                    console.warn(`Failed to parse gate tag: ${e}`);
                }
            }
        }

        // Reassemble
        let loadedCount = 0;
        for (const key in fragments) {
            try {
                const parts = fragments[key];
                // Check if we have all parts (no empty strings)
                // Note: parts is pre-filled with empty strings.
                /* 
                   If a part is missing, it will remain empty string (if we initialized correctly) 
                   or undefined if we just assigned by index.
                */
                if (parts.some(p => p === undefined || p === "")) {
                    console.warn(`Incomplete data for gate ${key}`);
                    continue;
                }

                const json = parts.join('');
                gates[key] = JSON.parse(json);
                loadedCount++;
            } catch (e) {
                console.warn(`Failed to reassemble gate ${key}: ${e}`);
            }
        }
        console.warn(`getAllGatesMap: Loaded ${loadedCount} gates.`);

        // Validation Pass: Ensure sign and button exist and sign text is correct.
        const validGates = {};
        for (const key in gates) {
            const gate = gates[key];
            if (!gate.signLocation) {
                validGates[key] = gate;
                continue;
            }

            try {
                const dim = world.getDimension(gate.signLocation.dim || "overworld");
                if (!dim) {
                    validGates[key] = gate; // Dimension not loaded?
                    continue;
                }

                const block = dim.getBlock(gate.signLocation);

                if (block) {
                    if (!block.typeId.includes("sign")) {
                        console.warn(`Gate ${gate.name} (${key}) sign missing (found ${block.typeId}). Removing.`);
                        this.deleteGate(key);
                        delete gates[key];
                        continue;
                    }

                    // Verify Sign Text
                    const signComp = block.getComponent("minecraft:sign");
                    if (signComp) {
                        const currentText = signComp.getText();
                        if (!currentText.includes(gate.name) || !currentText.includes(gate.network)) {
                            console.warn(`Sign text for ${gate.name} is wrong. Fixing.`);
                            this.setSignText(gate.signLocation, gate.name, gate.network, [gate.name]);
                        }
                    }
                }

                // 5. Healing: Ensure portalCenter and frameBlocks exist
                if (!gate.portalCenter || !gate.frameBlocks || gate.frameBlocks.length === 0) {
                    console.warn(`Healing gate data (missing center or frame): ${gate.name}`);
                    const gateDef = GateDefinitions.find(d => d.id === gate.id);
                    if (gateDef) {
                        const anchorBlock = dim.getBlock(gate.location);
                        if (anchorBlock) {
                            const match = this.matchGatePattern(gateDef, anchorBlock);
                            if (match) {
                                // Re-calculate portal and frame blocks
                                const portalBlocks = [];
                                const frameBlocks = [];
                                const layout = gateDef.layout;
                                const anchor = match.matchedAnchor;

                                for (let r = 0; r < layout.length; r++) {
                                    for (let c = 0; c < layout[r].length; c++) {
                                        const char = layout[r][c];
                                        const dy = anchor.r - r;
                                        const dLat = c - anchor.c;

                                        let tx = gate.location.x;
                                        let ty = gate.location.y + dy;
                                        let tz = gate.location.z;

                                        if (gate.axis === 'x') tx += dLat;
                                        else tz += dLat;

                                        const bLoc = { x: tx, y: ty, z: tz };
                                        if (char === '.' || char === '*') portalBlocks.push(bLoc);
                                        else if (char === 'X') frameBlocks.push(bLoc);
                                    }
                                }

                                gate.portalBlocks = portalBlocks;
                                gate.frameBlocks = frameBlocks;

                                // Recalculate Center
                                let cx = 0, cy = 0, cz = 0;
                                if (portalBlocks.length > 0) {
                                    portalBlocks.forEach(pb => { cx += pb.x; cy += pb.y; cz += pb.z; });
                                    gate.portalCenter = {
                                        x: cx / portalBlocks.length,
                                        y: cy / portalBlocks.length,
                                        z: cz / portalBlocks.length
                                    };
                                }
                                console.warn(`Healed center/frame for ${gate.name}. New center: ${JSON.stringify(gate.portalCenter)}`);
                            }
                        }
                    }
                }

                // 6. Button Healing & Placement Logic
                if (!gate.buttonLocation) {
                    console.warn(`Healing buttonLocation for legacy gate: ${gate.name}`);
                    // Use the same logic as createGate to find an anchor and place a button
                    // We'll have to re-match or assume based on signLocation relative to location.
                    const signLoc = gate.signLocation;
                    const anchorLoc = gate.location;

                    if (signLoc && anchorLoc) {
                        const offset = {
                            x: signLoc.x - anchorLoc.x,
                            y: signLoc.y - anchorLoc.y,
                            z: signLoc.z - anchorLoc.z
                        };

                        // For legacy healing, we might not have allAnchors easily. 
                        // Let's just try to find ANY air block adjacent to the frame? 
                        // Better yet: If matchGatePattern can be called here:
                        const gateDef = GateDefinitions.find(d => d.id === gate.id);
                        if (gateDef) {
                            const anchorBlock = dim.getBlock(anchorLoc);
                            if (anchorBlock) {
                                const match = this.matchGatePattern(gateDef, anchorBlock);
                                if (match && match.allAnchors) {
                                    let buttonAnchor = null;
                                    for (const a of match.allAnchors) {
                                        if (a.x !== anchorLoc.x || a.y !== anchorLoc.y || a.z !== anchorLoc.z) {
                                            buttonAnchor = a;
                                            break;
                                        }
                                    }
                                    if (buttonAnchor) {
                                        gate.buttonLocation = {
                                            x: buttonAnchor.x + offset.x,
                                            y: buttonAnchor.y + offset.y,
                                            z: buttonAnchor.z + offset.z,
                                            dim: anchorLoc.dim
                                        };
                                        console.warn(`Healed buttonLocation for ${gate.name} at ${gate.buttonLocation.x},${gate.buttonLocation.y},${gate.buttonLocation.z}`);
                                    }
                                }
                            }
                        }
                    }
                }

                // 6. Final Integrity Check (Button, Frame)

                // Button Check (Heal if missing)
                if (gate.buttonLocation) {
                    const buttonBlock = dim.getBlock(gate.buttonLocation);
                    if (!buttonBlock || (!buttonBlock.typeId.includes("button") && buttonBlock.isAir)) {
                        console.warn(`Healing missing button for ${gate.name} at ${gate.buttonLocation.x}, ${gate.buttonLocation.y}, ${gate.buttonLocation.z}`);
                        let buttonType = "minecraft:wooden_button";
                        if (block && (block.typeId.includes("mangrove") || block.typeId.includes("crimson"))) buttonType = "minecraft:mangrove_button";
                        else if (block && block.typeId.includes("cherry")) buttonType = "minecraft:cherry_button";

                        try {
                            if (buttonBlock) buttonBlock.setType(buttonType);
                        } catch (e) { }
                    }
                }

                // Frame Check (Log damage)
                if (gate.frameBlocks) {
                    let missingFrame = 0;
                    for (const fb of gate.frameBlocks) {
                        try {
                            const b = dim.getBlock(fb);
                            if (!b || b.isAir || b.isLiquid) missingFrame++;
                        } catch (e) { }
                    }
                    if (missingFrame > 0) {
                        console.warn(`Gate ${gate.name} frame is damaged (${missingFrame} blocks missing).`);
                    }
                }

                validGates[key] = gate;
            } catch (e) {
                // Chunk unloaded or other error
                validGates[key] = gate;
            }
        }

        return validGates;
    }

    static deleteGate(key) {
        const db = this.getDatabaseEntity();
        if (!db) return;

        // Remove all chunk tags for this key
        // Tag format: gate:KEY|...
        const prefix = `gate:${key}|`;
        const tags = db.getTags();
        let count = 0;
        for (const tag of tags) {
            if (tag.startsWith(prefix)) {
                db.removeTag(tag);
                count++;
            }
        }
        console.warn(`Deleted gate ${key} (${count} tags removed).`);
    }

    static getDatabaseEntity() {
        // Try to find the existing entity
        const dim = world.getDimension("overworld");
        if (!dim) return null;

        // We look for a specific tag
        const entities = dim.getEntities({
            tags: ["stargate_db"]
        });

        if (entities.length > 0) {
            return entities[0];
        }

        // Create if not exists
        // Spawn at a safe bedrock location (e.g., 0, -60, 0)
        try {
            const ent = dim.spawnEntity("minecraft:armor_stand", { x: 0, y: -60, z: 0 });
            ent.addTag("stargate_db");
            ent.nameTag = "StargateDB"; // Optional: keep it visible for debug? Or hide it.
            ent.addEffect("invisibility", 20000000, { amplifier: 1, showParticles: false });
            console.warn("Created new StargateDB entity.");
            return ent;
        } catch (e) {
            console.warn("Error creating DB entity: " + e);
            return null;
        }
    }

    static getAllGates() {
        return Object.keys(this.getAllGatesMap());
    }

    static async showSetupUI(match, player, signBlock) {
        // Capture sign location details immediately to persist across async gap
        const signLocationCtx = {
            x: signBlock.x,
            y: signBlock.y,
            z: signBlock.z,
            dim: signBlock.dimension.id
        };

        // Capture anchor details
        const matchContext = {
            gateDef: match.gateDef,
            axis: match.axis,
            anchor: match.matchedAnchor,
            anchorLoc: {
                x: match.anchorBlock.x,
                y: match.anchorBlock.y,
                z: match.anchorBlock.z,
                dim: match.anchorBlock.dimension.id
            },
            allAnchors: match.allAnchors
        };

        const form = new ModalFormData()
            .title(`Setup ${match.gateDef.id} Stargate`)
            .textField("Name", "Enter gate name (e.g. Base)")
            .textField("Network", "Enter network name", "central");

        const response = await form.show(player);
        if (response.canceled) return;

        const [name, network] = response.formValues;
        if (!name) {
            player.sendMessage("Gate name cannot be empty.");
            return;
        }

        this.createGate(matchContext, player, name, network, signLocationCtx);
    }

    static createGate(matchCtx, player, name, network, signLocCtx) {
        const { gateDef, axis, anchor, anchorLoc, allAnchors } = matchCtx;
        const layout = gateDef.layout;
        const portalOpenMat = gateDef.config['portal-open'];
        const portalClosedMat = gateDef.config['portal-closed'];
        const portalBlocks = [];
        const frameBlocks = [];

        const dim = world.getDimension(anchorLoc.dim);
        if (!dim) {
            console.warn("Dimension not found for gate creation");
            return;
        }

        // Parse layout for portal and frame blocks
        for (let r = 0; r < layout.length; r++) {
            for (let c = 0; c < layout[r].length; c++) {
                const char = layout[r][c];
                const dy = anchor.r - r;
                const dLat = c - anchor.c;

                let targetX = anchorLoc.x;
                let targetY = anchorLoc.y + dy;
                let targetZ = anchorLoc.z;

                if (axis === 'x') targetX += dLat;
                else targetZ += dLat;

                const bLoc = { x: targetX, y: targetY, z: targetZ };

                if (char === '.') {
                    const block = dim.getBlock(bLoc);
                    if (block) {
                        block.setType(portalClosedMat);
                    }
                    portalBlocks.push(bLoc);
                } else if (char === 'X') {
                    frameBlocks.push(bLoc);
                }
            }
        }

        console.warn(`createGate: ${name} identified ${portalBlocks.length} portal blocks and ${frameBlocks.length} frame blocks.`);

        const key = this.getGateKey({ x: anchorLoc.x, y: anchorLoc.y, z: anchorLoc.z, dimension: { id: anchorLoc.dim } });

        // Sign location is passed in explicitly now
        let signLocation = null;
        if (signLocCtx) {
            signLocation = { x: signLocCtx.x, y: signLocCtx.y, z: signLocCtx.z, dim: signLocCtx.dim };
        }

        // Identify button location
        const offset = {
            x: signLocCtx.x - anchorLoc.x,
            y: signLocCtx.y - anchorLoc.y,
            z: signLocCtx.z - anchorLoc.z
        };

        let buttonAnchor = null;
        if (allAnchors && allAnchors.length > 1) {
            for (const a of allAnchors) {
                if (a.x !== anchorLoc.x || a.y !== anchorLoc.y || a.z !== anchorLoc.z) {
                    buttonAnchor = a;
                    break;
                }
            }
        }

        if (!buttonAnchor) buttonAnchor = anchorLoc;

        const buttonLocation = {
            x: buttonAnchor.x + offset.x,
            y: buttonAnchor.y + offset.y,
            z: buttonAnchor.z + offset.z,
            dim: anchorLoc.dim
        };

        // Place button
        try {
            const bBlock = dim.getBlock(buttonLocation);
            if (bBlock) {
                const signBlock = dim.getBlock(signLocCtx);
                const signPerm = signBlock.permutation;
                let buttonType = "minecraft:wooden_button";
                if (signBlock && (signBlock.typeId.includes("mangrove") || signBlock.typeId.includes("crimson"))) buttonType = "minecraft:mangrove_button";
                else if (signBlock && signBlock.typeId.includes("cherry")) buttonType = "minecraft:cherry_button";
                else if (signBlock && signBlock.typeId.includes("oak")) buttonType = "minecraft:wooden_button";

                // Resolve facing for button
                // Buttons in Bedrock use "facing_direction" (2=north, 3=south, 4=west, 5=east)
                // This corresponds to which face they are ON. 
                // However, they also often take the direction they face AWAY from.
                const facingStr = signPerm.getState("facing");
                const facingDir = signPerm.getState("facing_direction");

                try {
                    // Place the block first
                    bBlock.setType(buttonType);

                    // Then try to correct orientation
                    let buttonPerm = BlockPermutation.resolve(buttonType);
                    if (facingStr) {
                        // signs 'facing south' (3) means it is on the south face of a block, facing south.
                        // buttons usually match this.
                        buttonPerm = buttonPerm.withState("facing_direction", facingDir !== undefined ? facingDir : 3);
                    } else if (facingDir !== undefined) {
                        buttonPerm = buttonPerm.withState("facing_direction", facingDir);
                    }

                    bBlock.setPermutation(buttonPerm);
                } catch (e) {
                    console.warn(`Failed to set button permutation: ${e}`);
                    bBlock.setType(buttonType);
                }

                console.warn(`Placed ${buttonType} at ${buttonLocation.x},${buttonLocation.y},${buttonLocation.z} with sign-matched facing.`);
            }
        } catch (e) {
            console.warn(`Error placing button: ${e}`);
        }

        let finalOpenMat = portalOpenMat;
        if (portalOpenMat === "minecraft:nether_portal") finalOpenMat = "minecraft:portal";

        // Calculate Portal Center
        let centerX = 0, centerY = 0, centerZ = 0;
        if (portalBlocks.length > 0) {
            portalBlocks.forEach(pb => {
                centerX += pb.x;
                centerY += pb.y;
                centerZ += pb.z;
            });
            centerX /= portalBlocks.length;
            centerY /= portalBlocks.length;
            centerZ /= portalBlocks.length;
        } else {
            centerX = anchorLoc.x;
            centerY = anchorLoc.y;
            centerZ = anchorLoc.z;
        }

        // Determine Exit Direction based on sign facing
        let exitDirection = { x: 0, y: 0, z: 1, rotY: 0 }; // Default South
        try {
            const signBlock = dim.getBlock(signLocCtx);
            const signPerm = signBlock.permutation;
            const facingStr = signPerm.getState("facing");
            const facingDir = signPerm.getState("facing_direction");

            if (facingStr === "north" || facingDir === 2) {
                exitDirection = { x: 0, y: 0, z: -1, rotY: 180 }; // Exit North, Face North
            } else if (facingStr === "south" || facingDir === 3) {
                exitDirection = { x: 0, y: 0, z: 1, rotY: 0 };    // Exit South, Face South
            } else if (facingStr === "west" || facingDir === 4) {
                exitDirection = { x: -1, y: 0, z: 0, rotY: 90 };   // Exit West, Face West
            } else if (facingStr === "east" || facingDir === 5) {
                exitDirection = { x: 1, y: 0, z: 0, rotY: 270 };  // Exit East, Face East
            }
        } catch (e) {
            console.warn(`Failed to determine exit direction: ${e}`);
        }

        const gateData = {
            id: gateDef.id,
            name,
            network,
            axis,
            location: { x: anchorLoc.x, y: anchorLoc.y, z: anchorLoc.z, dim: anchorLoc.dim },
            portalBlocks,
            frameBlocks, // NEW: Store frame blocks
            signLocation,
            buttonLocation,
            portalCenter: { x: centerX, y: centerY, z: centerZ },
            exitDirection: exitDirection,
            portalOpenMat: finalOpenMat,
            portalClosedMat: portalClosedMat
        };

        this.saveGateData(key, gateData);
        this.setSignText(signLocCtx, name, network, [name]);

        console.warn(`Gate '${name}' created. Center: ${centerX},${centerY},${centerZ}. Exit: ${JSON.stringify(exitDirection)}`);
        player.sendMessage(`Stargate '${name}' created on network '${network}'!`);
    }

    static autoBuildGate(player, gateDef, startLoc, axis) {
        if (player.hasTag("stargate_summoning")) {
            player.sendMessage("§cSummoning already in progress!§r");
            return;
        }

        const dim = world.getDimension(startLoc.dim || "overworld");
        if (!dim) return;

        console.warn(`autoBuildGate: ${gateDef.id} from bottom-left origin ${startLoc.x},${startLoc.y},${startLoc.z} axis ${axis}`);
        player.addTag("stargate_summoning");

        const layout = gateDef.layout;
        let blocksToPlace = [];
        let controlLocations = [];

        // Collect all blocks to be placed
        // Sequential order: bottom row to top row, left to right
        for (let r = layout.length - 1; r >= 0; r--) {
            for (let c = 0; c < layout[r].length; c++) {
                const char = layout[r][c];
                if (char === ' ') continue;

                const dy = (layout.length - 1) - r;
                const dLat = c;

                let tx = startLoc.x;
                let ty = startLoc.y + dy;
                let tz = startLoc.z;

                if (axis === 'x') tx += dLat;
                else tz += dLat;

                let mat = gateDef.materials[char];
                if (char === '.') mat = gateDef.config['portal-closed'];

                // Track control locations (the '-' blocks)
                if (char === '-') {
                    controlLocations.push({ x: tx, y: ty, z: tz });
                }

                blocksToPlace.push({ x: tx, y: ty, z: tz, mat });
            }
        }

        let totalXpCost = 0;
        let index = 0;

        const placeNextBlock = () => {
            if (index >= blocksToPlace.length) {
                // Summoning finished
                const finalCost = Math.min(totalXpCost, 30);
                try {
                    player.addExperience(-finalCost);
                } catch (e) {
                    console.warn(`Failed to deduct XP: ${e}`);
                }
                player.sendMessage(`§6Stargate summoning complete!§r Cost: §e${finalCost} XP§r.`);

                // Auto-place sign and button
                if (controlLocations.length > 0) {
                    this.autoPlaceControls(player, controlLocations, gateDef);
                }

                // Apply Durability Damage to the Casting Guide
                this.damageCastingGuide(player);
                player.removeTag("stargate_summoning");
                return;
            }

            const { x, y, z, mat } = blocksToPlace[index];
            const block = dim.getBlock({ x, y, z });

            if (block && block.typeId !== mat) {
                if (mat !== "minecraft:air") {
                    if (this.consumeItem(player, mat)) totalXpCost += 1;
                    else totalXpCost += 5;
                }

                try {
                    block.setType(mat);
                } catch (e) {
                    console.warn(`Failed to place ${mat} at ${x},${y},${z}: ${e}`);
                }
            }

            index++;
            system.runTimeout(placeNextBlock, 1); // 1 tick delay between blocks
        };

        placeNextBlock();
    }

    static autoPlaceControls(player, controlLocs, gateDef) {
        const dim = player.dimension;

        // Block IDs for placement (Bedrock specific)
        // Use wall_sign to attach to the frame instead of replacing it
        const signType = "minecraft:wall_sign";

        console.warn(`Auto-placing controls: Sign=${signType} at ${controlLocs.length} potential locations`);

        // Determine orientation and offset based on player facing
        const rot = player.getRotation().y;
        let facingDirection = 2; // North
        let offset = { x: 0, y: 0, z: 0 };

        // Bedrock Rotation (Script API): 0=South(+Z), 90=West(-X), 180/-180=North(-Z), -90=East(+X)
        if (rot >= -45 && rot < 45) {
            // Facing South (+Z), seeing North face (-Z)
            facingDirection = 2; offset.z = -1;
        } else if (rot >= 45 && rot < 135) {
            // Facing West (-X), seeing East face (+X)
            facingDirection = 5; offset.x = 1;
        } else if (rot >= -135 && rot < -45) {
            // Facing East (+X), seeing West face (-X)
            facingDirection = 4; offset.x = -1;
        } else {
            // Facing North (-Z), seeing South face (+Z)
            facingDirection = 3; offset.z = 1;
        }

        // Place Sign on the first control location (which is a frame block) with offset
        if (controlLocs[0]) {
            const frameLoc = controlLocs[0];
            const signLoc = { x: frameLoc.x + offset.x, y: frameLoc.y + offset.y, z: frameLoc.z + offset.z };
            const block = dim.getBlock(signLoc);

            try {
                console.warn(`Placing wall sign at ${signLoc.x},${signLoc.y},${signLoc.z} attached to frame at ${frameLoc.x},${frameLoc.y},${frameLoc.z}`);
                block.setType(signType);
                const signPerm = BlockPermutation.resolve(signType, { "facing_direction": facingDirection });
                block.setPermutation(signPerm);

                // Allow a tick for the block to initialize before setting text
                system.run(() => {
                    const signBlock = dim.getBlock(signLoc);
                    if (signBlock) {
                        const signComp = signBlock.getComponent("minecraft:sign");
                        if (signComp) {
                            signComp.setText("§b[Stargate]§r\n§8(Right-click)§r");
                            console.warn("Sign text set successfully.");
                        } else {
                            console.warn("Failed to find sign component on placed block.");
                        }
                    }
                });
            } catch (e) {
                console.warn(`Sign place error: ${e}`);
            }
        }

        // Note: Button placement is skipped during summoning per user request.
        // It will be generated during the gate registration/setup phase (in createGate).
    }

    static damageCastingGuide(player) {
        const equippable = player.getComponent("minecraft:equippable");
        if (!equippable) return;

        const item = equippable.getEquipment("Mainhand");
        if (!item || item.typeId !== "stargate:plan_book") return;

        const durability = item.getComponent("minecraft:durability");
        if (!durability) return;

        if (durability.damage + 1 >= durability.maxDurability) {
            equippable.setEquipment("Mainhand", undefined);
            player.sendMessage("§cThe Stargate Casting Guide has worn out and been destroyed!§r");
            player.playSound("random.break");
        } else {
            durability.damage += 1;
            equippable.setEquipment("Mainhand", item);
        }
    }

    static consumeItem(player, typeId) {
        const inv = player.getComponent("minecraft:inventory").container;
        if (!inv) return false;

        for (let i = 0; i < inv.size; i++) {
            const item = inv.getItem(i);
            if (item && item.typeId === typeId) {
                if (item.amount > 1) {
                    item.amount--;
                    inv.setItem(i, item);
                } else {
                    inv.setItem(i, undefined);
                }
                return true;
            }
        }
        return false;
    }
}
