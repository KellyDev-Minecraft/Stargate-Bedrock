import { world, BlockPermutation, system } from "@minecraft/server";
import { GateDefinitions } from "./data/gate_definitions.js";
import { ModalFormData, ActionFormData } from "@minecraft/server-ui";

export class GateManager {
    static primedGates = [];
    static activePortals = [];
    static tickCounter = 0;
    static recentTeleports = new Map();
    static gatesCache = null;

    static getPotentialGateMatch(signBlock) {
        const attachedBlock = this.getAttachedBlock(signBlock);
        if (!attachedBlock) return null;

        for (const gateDef of GateDefinitions) {
            const match = this.matchGatePattern(gateDef, attachedBlock);
            if (match) return match;
        }
        return null;
    }

    // --- SIGN BASED CREATION ---
    static checkAndCreateGateFromSign(signBlock, player) {
        console.warn("GateManager.checkAndCreateGateFromSign called");
        const match = this.getPotentialGateMatch(signBlock);

        if (match) {
            this.showSetupUI(match, player, signBlock);
        } else {
            // No match found
            player.sendMessage("No valid gate pattern found.");
        }
    }

    // --- SIGN BASED INTERACTION ---
    static handleSignInteraction(signBlock, player) {
        console.warn("handleSignInteraction called");
        let gate = this.findGateBySign(signBlock);
        if (!gate) {
            console.warn("handleSignInteraction: No gate found for this sign.");
            return;
        }

        // Real-time check: If sign text was edited, update DB immediately on click
        const signComp = signBlock.getComponent("minecraft:sign");
        if (signComp) {
            const currentText = signComp.getText();
            const parsed = this.parseStargateSignText(currentText);
            if (parsed && (parsed.name !== gate.name || parsed.network !== gate.network)) {
                console.warn(`[Stargate] Real-time sign update: ${gate.name} -> ${parsed.name} (network: ${parsed.network})`);
                const key = this.getGateKey(signBlock.dimension.getBlock(gate.location));
                gate.name = parsed.name;
                gate.network = parsed.network;
                this.saveGateData(key, gate);
                this.gatesCache = null;
                this.getAllGatesMap();
            }
        }

        // Check if gate is Private ('P')
        if (gate.flags && gate.flags.includes('P') && !this.hasGateControlPermission(player, gate)) {
            player.sendMessage("§cThis Stargate is private and can only be accessed by its owner!§r");
            return;
        }

        // Always-on gates ('A', 'R', 'U') cannot be manually dialed
        if (gate.flags && (gate.flags.includes('A') || gate.flags.includes('R') || gate.flags.includes('U'))) {
            player.sendMessage("§eThis Stargate is always active. Walk in to teleport!§r");
            return;
        }

        // Find existing priming for this player and gate
        let prime = this.primedGates.find(p => p.player.id === player.id && p.source.location.x === gate.location.x && p.source.location.y === gate.location.y && p.source.location.z === gate.location.z);

        if (!prime) {
            // First time tapping: Start Priming
            console.warn(`Starting priming for ${gate.name}`);
            const allGates = this.getAllGatesMap();
            // Filter out hidden ('H') gates from targets list
            const targets = Object.values(allGates).filter(g => 
                g.network === gate.network && 
                g.name !== gate.name && 
                (!g.flags || !g.flags.includes('H'))
            );

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

        // Ensure button exists (Heal if missing)
        this.healButton(gate, signBlock.dimension);
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
        const blockId = block.typeId;

        if (char === '-') {
            // Control points (signs/buttons) - usually on frame blocks
            // Must match one of the defined materials
            const materials = Object.values(gateDef.materials);
            return materials.some(mat => blockId === mat || blockId.includes(mat.replace('minecraft:', '')));
        } else if (char === '.') {
            // Portal material - ALWAY MATCHES during validation (ignore portal blocks)
            return true;
        } else if (gateDef.materials[char]) {
            const expectedMat = gateDef.materials[char];
            // Allow AIR match if we expect AIR
            if (expectedMat === 'minecraft:air' && block.isAir) return true;
            return blockId === expectedMat || blockId.includes(expectedMat.replace('minecraft:', ''));
        }

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

            // Dynamically look up the gate flags from DB
            const gate = this.findGateBySign({ x: loc.x, y: loc.y, z: loc.z, dimension: { id: loc.dim } });
            const hasN = gate && gate.flags && gate.flags.toUpperCase().includes('N');
            const flags = gate && gate.flags ? gate.flags.toUpperCase() : "";

            const netDisp = hasN ? "------------" : network;

            if (isActive) {
                // Active Portal State
                const dest = targets[0] || "Unknown";
                text = `§1-${name}-\n§c>> ACTIVE <<\n§4${dest}`;
            } else if (selectedIndex === -1) {
                // Default State
                text = `§1-${name}-\n§8------------\n§3${netDisp}`;
                if (flags) {
                    text += `\n§5${flags}`;
                }
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
        let openMat = "minecraft:basic_flame_particle";
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

        for (const pb of gate.portalBlocks) {
            try {
                const block = dim.getBlock(pb);
                if (block) {
                    let permutation;
                    let isBlock = true;
                    try {
                        permutation = BlockPermutation.resolve(blockType);
                    } catch (e) {
                        // Not a valid block (likely a particle ID), force Air so path is clear
                        permutation = BlockPermutation.resolve("minecraft:air");
                        isBlock = false;
                    }

                    block.setPermutation(permutation);
                }
            } catch (e) {
                console.warn(`  - Error setting block at ${pb.x}, ${pb.y}, ${pb.z}: ${e}`);
            }
        }
    }

    static tickCounter = 0;
    static tick() {
        this.tickCounter++;

        // 1. Handle Primed Gates (Sign touched, waiting for button)
        if (this.primedGates.length > 0) {
            for (let i = this.primedGates.length - 1; i >= 0; i--) {
                const p = this.primedGates[i];
                p.ticksLeft--;
                if (p.ticksLeft <= 0) {
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
            const checkIntegrity = this.tickCounter % 20 === 0;

            for (let i = this.activePortals.length - 1; i >= 0; i--) {
                const ap = this.activePortals[i];
                ap.ticksRemaining--;

                // Frame Integrity Check (Only every 1 second / 20 ticks)
                let frameIntact = true;
                if (checkIntegrity && ap.gate.frameBlocks) {
                    const dim = world.getDimension(ap.gate.location.dim);
                    if (dim) {
                        for (const fb of ap.gate.frameBlocks) {
                            try {
                                const block = dim.getBlock(fb);
                                if (!block || block.isAir || block.isLiquid) {
                                    frameIntact = false;
                                    break;
                                }
                            } catch (e) { }
                        }
                    }
                }

                if (!frameIntact || ap.ticksRemaining <= 0) {
                    this.setPortalBlocks(ap.gate, false);
                    if (ap.gate.signLocation) {
                        this.setSignText(ap.gate.signLocation, ap.gate.name, ap.gate.network, []);
                    }
                    this.activePortals.splice(i, 1);
                    continue;
                }

                // Teleportation Logic
                const dim = world.getDimension(ap.gate.location.dim);
                if (dim) {
                    // Particle Spawning
                    const gateDef = GateDefinitions.find(d => d.id === ap.gate.id);
                    let particleId = "minecraft:basic_flame_particle"; // Default

                    if (gateDef && gateDef.config && gateDef.config['portal-open']) {
                        // Check if portal-open is NOT a block (i.e. it's a particle)
                        // We do this check to allow 'portal-open' to serve as the particle ID
                        try {
                            BlockPermutation.resolve(gateDef.config['portal-open']);
                            // It is a valid block, so NO particles
                            particleId = null;
                        } catch (e) {
                            // Resolution failed, so it's not a block. Assume it's a particle.
                            particleId = gateDef.config['portal-open'];
                        }
                    }

                    if (particleId) {
                        try {
                            // Limit to 2 particles per tick per gate
                            for (let p = 0; p < 2; p++) {
                                const randBlock = ap.gate.portalBlocks[Math.floor(Math.random() * ap.gate.portalBlocks.length)];
                                const px = randBlock.x + Math.random();
                                const py = randBlock.y + Math.random();
                                const pz = randBlock.z + Math.random();
                                dim.spawnParticle(particleId, { x: px, y: py, z: pz });
                            }
                        } catch (e) { }
                    }

                    const players = dim.getPlayers({ location: ap.gate.location, maxDistance: 8 });
                    for (const p of players) {
                        const pLoc = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
                        if (ap.gate.portalBlocks.some(pb => pb.x === pLoc.x && pb.y === pLoc.y && pb.z === pLoc.z)) {
                            this.teleportPlayer(p, ap.target);
                        }
                    }
                }
            }
        }

        // 3. Handle Permanent / Always-On Gates ('A', 'R', 'U')
        const checkPermanents = this.tickCounter % 5 === 0;
        if (checkPermanents) {
            const allGates = this.getAllGatesMap();
            for (const key in allGates) {
                const gate = allGates[key];
                const flags = gate.flags ? gate.flags.toUpperCase() : "";
                const hasA = flags.includes('A');
                const hasR = flags.includes('R');
                const hasU = flags.includes('U');

                if (hasA || hasR || hasU) {
                    // Open portal blocks if they aren't already
                    if (this.tickCounter % 100 === 0) {
                        this.setPortalBlocks(gate, true);
                    }

                    const dim = world.getDimension(gate.location.dim);
                    if (dim) {
                        const hasQ = flags.includes('Q');
                        if (!hasQ && this.tickCounter % 10 === 0) {
                            try {
                                const randBlock = gate.portalBlocks[Math.floor(Math.random() * gate.portalBlocks.length)];
                                dim.spawnParticle("minecraft:basic_flame_particle", { x: randBlock.x + Math.random(), y: randBlock.y + Math.random(), z: randBlock.z + Math.random() });
                            } catch (e) {}
                        }

                        // Check players stepping into always-on portal
                        const players = dim.getPlayers({ location: gate.location, maxDistance: 8 });
                        for (const p of players) {
                            const pLoc = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
                            if (gate.portalBlocks.some(pb => pb.x === pLoc.x && pb.y === pLoc.y && pb.z === pLoc.z)) {
                                if (hasR) {
                                    this.teleportRandomly(p, gate);
                                } else {
                                    const dest = this.findAlwaysOnDestination(gate);
                                    if (dest) {
                                        this.teleportPlayer(p, dest);
                                    }
                                }
                            }
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
        // ... rest of teleport logic

        const hasB = targetGate.flags && targetGate.flags.toUpperCase().includes('B');
        const hasQ = targetGate.flags && targetGate.flags.toUpperCase().includes('Q');

        // Use portalCenter if available, otherwise fallback to location
        let baseLoc = targetGate.portalCenter || targetGate.location;
        let tx = baseLoc.x + 0.5;
        let ty = baseLoc.y;
        let tz = baseLoc.z + 0.5;
        let rotY = 0;

        // Apply exit direction offset (usually 1.5 blocks out from center)
        const mult = hasB ? -1.5 : 1.5;
        if (targetGate.exitDirection) {
            tx += targetGate.exitDirection.x * mult;
            ty += targetGate.exitDirection.y;
            tz += targetGate.exitDirection.z * mult;
            rotY = targetGate.exitDirection.rotY || 0;
            if (hasB) {
                rotY = (rotY + 180) % 360; // Flip rotation for backward exit
            }
        } else {
            // Legacy fallback
            if (targetGate.axis === 'x') {
                tz += hasB ? -2.0 : 2.0;
                rotY = hasB ? 180 : 0;
            } else {
                tx += hasB ? -2.0 : 2.0;
                rotY = hasB ? 270 : 90;
            }
        }

        try {
            if (!hasQ) {
                console.warn(`Teleporting ${player.name} to center of ${targetGate.name} at ${tx.toFixed(2)}, ${ty}, ${tz.toFixed(2)} facing ${rotY}`);
            }

            // Print frame positions for debugging
            if (targetGate.frameBlocks && targetGate.frameBlocks.length > 0 && !hasQ) {
                console.warn(`Target gate frame blocks (${targetGate.frameBlocks.length}):`);
                targetGate.frameBlocks.forEach((fb, i) => {
                    console.warn(`  [${i}] ${fb.x}, ${fb.y}, ${fb.z}`);
                });
            }

            player.teleport({ x: tx, y: ty, z: tz }, { dimension: dim, rotation: { x: 0, y: rotY } });
            
            if (!hasQ) {
                player.sendMessage(`§aTeleported to Stargate '${targetGate.name}'!§r`);
            }
        } catch (e) {
            if (!hasQ) console.warn(`Teleport failed: ${e}`);
        }
    }

    static getGateKey(block) {
        return `sg_${block.dimension.id}_${block.x}_${block.y}_${block.z}`;
    }

    static getGateData(key) {
        if (this.gatesCache && this.gatesCache[key]) return this.gatesCache[key];
        const allGates = this.getAllGatesMap();
        return allGates[key] || null;
    }

    static saveGateData(key, data) {
        const db = this.getDatabaseEntity();
        if (!db) return;

        // Update Cache
        if (!this.gatesCache) this.gatesCache = {};
        this.gatesCache[key] = data;

        // Clean up old tags for this key
        const prefix = `gate:${key}|`;
        for (const tag of db.getTags()) {
            if (tag.startsWith(prefix)) db.removeTag(tag);
        }

        const json = JSON.stringify(data);
        const CHUNK_SIZE = 150; // Reduced to 150 to safely fit within 255 char tag limit (overhead is ~40-60 chars)
        const totalChunks = Math.ceil(json.length / CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
            const chunk = json.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            db.addTag(`gate:${key}|${i}|${totalChunks}|${chunk}`);
        }
    }

    static getAllGatesMap() {
        if (this.gatesCache) return this.gatesCache;

        const db = this.getDatabaseEntity();
        if (!db) return {};

        const fragments = {};
        for (const tag of db.getTags()) {
            if (!tag.startsWith("gate:")) continue;
            try {
                const parts = tag.split('|');
                if (parts.length < 4) continue;

                const key = parts[0].substring(5);
                const index = parseInt(parts[1]);
                const total = parseInt(parts[2]);
                const data = parts.slice(3).join('|');

                if (!fragments[key]) fragments[key] = new Array(total);
                fragments[key][index] = data;
            } catch (e) { }
        }

        const gates = {};
        for (const key in fragments) {
            try {
                const parts = fragments[key];
                if (parts.some(p => p === undefined)) continue;
                gates[key] = JSON.parse(parts.join(''));
            } catch (e) { }
        }

        this.gatesCache = gates;
        return gates;
    }

    /**
     * Performs maintenance on all gates: healing signs, buttons, and checking integrity.
     */
    static runMaintenance() {
        const gates = this.getAllGatesMap();
        console.warn(`[Stargate] Running maintenance on ${Object.keys(gates).length} gates...`);

        for (const key in gates) {
            const gate = gates[key];
            try {
                const dim = world.getDimension(gate.location.dim);
                if (!dim) continue;

                if (gate.signLocation) {
                    const block = dim.getBlock(gate.signLocation);
                    if (block) {
                        if (!block.typeId.includes("sign")) {
                            this.deleteGate(key);
                            continue;
                        }
                        const signComp = block.getComponent("minecraft:sign");
                        if (signComp) {
                            const currentText = signComp.getText();
                            const parsed = this.parseStargateSignText(currentText);
                            if (parsed && (parsed.name !== gate.name || parsed.network !== gate.network)) {
                                console.warn(`[Stargate] Sign update detected for gate: ${gate.name} -> ${parsed.name} (network: ${parsed.network})`);
                                gate.name = parsed.name;
                                gate.network = parsed.network;
                                this.saveGateData(key, gate);
                                this.setSignText(gate.signLocation, gate.name, gate.network, [gate.name]);
                            } else if (!currentText.includes(gate.name)) {
                                this.setSignText(gate.signLocation, gate.name, gate.network, [gate.name]);
                            }
                        }
                    }
                }

                // Healing missing data
                if (!gate.portalCenter || !gate.frameBlocks || gate.frameBlocks.length === 0) {
                    const gateDef = GateDefinitions.find(d => d.id === gate.id);
                    if (gateDef) {
                        const anchorBlock = dim.getBlock(gate.location);
                        if (anchorBlock) {
                            const match = this.matchGatePattern(gateDef, anchorBlock);
                            if (match) {
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
                                if (portalBlocks.length > 0) {
                                    let cx = 0, cy = 0, cz = 0;
                                    portalBlocks.forEach(pb => { cx += pb.x; cy += pb.y; cz += pb.z; });
                                    gate.portalCenter = { x: cx / portalBlocks.length, y: cy / portalBlocks.length, z: cz / portalBlocks.length };
                                }
                                this.saveGateData(key, gate);
                            }
                        }
                    }
                }

                // Button Healing
                this.healButton(gate, dim);
            } catch (e) { }
        }
    }

    /**
     * Ensures the button for a gate exists, placing it if missing.
     */
    static healButton(gate, dim) {
        if (!gate.buttonLocation) return;
        try {
            const buttonBlock = dim.getBlock(gate.buttonLocation);
            if (buttonBlock && (buttonBlock.isAir || !buttonBlock.typeId.includes("button"))) {
                let buttonType = "minecraft:wooden_button";
                // Try to match button type to sign if possible, or just use default
                const gateDef = GateDefinitions.find(d => d.id === gate.id);
                if (gateDef && gateDef.config && gateDef.config.button) {
                    buttonType = gateDef.config.button;
                }

                buttonBlock.setType(buttonType);

                // Try to set orientation if we have exitDirection
                if (gate.exitDirection) {
                    let facingDir = 3; // South
                    if (gate.exitDirection.rotY === 180) facingDir = 2; // North
                    else if (gate.exitDirection.rotY === 90) facingDir = 5; // East (Wait, exit West means facing East?)
                    else if (gate.exitDirection.rotY === 270) facingDir = 4; // West

                    // Note: Bedrock button facing_direction is where it's ATTACHED.
                    // If exit is South, sign is on North face of block, facing South.
                    // Button should probably match.
                    try {
                        const perm = BlockPermutation.resolve(buttonType, { "facing_direction": facingDir });
                        buttonBlock.setPermutation(perm);
                    } catch (e) { }
                }
            }
        } catch (e) { }
    }

    static deleteGate(key) {
        // Update Cache
        if (this.gatesCache) delete this.gatesCache[key];

        const db = this.getDatabaseEntity();
        if (!db) return;

        const prefix = `gate:${key}|`;
        for (const tag of db.getTags()) {
            if (tag.startsWith(prefix)) db.removeTag(tag);
        }
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

    static repairDatabase(player) {
        const dim = world.getDimension("overworld");
        if (!dim) return { success: false, message: "§cCould not access overworld dimension.§r" };

        let entities = [];
        try {
            entities = dim.getEntities({
                tags: ["stargate_db"]
            });
        } catch (e) {
            return { success: false, message: `§cError querying entities: ${e}§r` };
        }

        let repairedDuplication = false;
        let duplicateCount = 0;
        let master = null;

        if (entities.length > 0) {
            master = entities[0];
            if (entities.length > 1) {
                repairedDuplication = true;
                duplicateCount = entities.length - 1;
                // Merge tags from duplicates to master
                const masterTags = new Set(master.getTags());
                for (let i = 1; i < entities.length; i++) {
                    const dup = entities[i];
                    for (const tag of dup.getTags()) {
                        if (tag.startsWith("gate:") && !masterTags.has(tag)) {
                            master.addTag(tag);
                        }
                    }
                    try {
                        dup.remove();
                    } catch (e) {}
                }
            }
        } else {
            // No DB entity exists at all, getDatabaseEntity will create one
            master = this.getDatabaseEntity();
        }

        if (!master) {
            return { success: false, message: "§cFailed to locate or create a primary database entity.§r" };
        }

        // Now, let's scan all registered gates and prune orphaned ones in loaded chunks
        this.gatesCache = null; // Clear cache first to reload fresh
        const gates = this.getAllGatesMap();
        let prunedCount = 0;
        
        for (const key in gates) {
            const gate = gates[key];
            if (gate.signLocation) {
                try {
                    const gateDim = world.getDimension(gate.location.dim);
                    if (gateDim) {
                        const signBlock = gateDim.getBlock(gate.signLocation);
                        // If block is loaded (not undefined) and is not a sign, prune it
                        if (signBlock && !signBlock.typeId.includes("sign")) {
                            this.deleteGate(key);
                            prunedCount++;
                        }
                    }
                } catch (e) {
                    // Ignore transient errors or unloaded chunk issues
                }
            }
        }

        // Force reload cache
        this.gatesCache = null;
        this.getAllGatesMap();

        let msg = "§aDatabase repair complete!§r\n";
        if (repairedDuplication) msg += `§e- Merged & removed ${duplicateCount} duplicate database entities.§r\n`;
        if (prunedCount > 0) msg += `§e- Pruned ${prunedCount} orphaned/broken gates.§r\n`;
        else msg += `§a- No orphaned gates detected in loaded chunks.§r\n`;
        
        return { success: true, message: msg };
    }

    static resetDatabase() {
        const dim = world.getDimension("overworld");
        if (!dim) return false;

        let entities = [];
        try {
            entities = dim.getEntities({
                tags: ["stargate_db"]
            });
        } catch (e) {}

        for (const ent of entities) {
            try {
                ent.remove();
            } catch (e) {}
        }

        this.gatesCache = null;
        // Recreate fresh
        this.getDatabaseEntity();
        return true;
    }

    static parseStargateSignText(signText) {
        if (!signText) return null;
        
        const lines = signText.split('\n').map(l => l.trim());
        if (lines.length < 3) return null;

        const cleanLine = (str) => str.replace(/§[0-9a-fk-or]/gi, '').trim();

        const line1 = cleanLine(lines[0]);
        const line3 = cleanLine(lines[2]);

        if (line1.startsWith('-') && line1.endsWith('-') && line1.length > 2) {
            const name = line1.substring(1, line1.length - 1).trim();
            const network = line3.trim();
            if (name && network && network !== "------------") {
                return { name, network };
            }
        }
        return null;
    }

    static recreateGateFromSignText(match, signBlock, name, network, player) {
        const { gateDef, axis, allAnchors } = match;
        const dimId = signBlock.dimension.id;
        
        const portalBlocks = [];
        const frameBlocks = [];
        const layout = gateDef.layout;
        const anchor = match.matchedAnchor;
        
        for (let r = 0; r < layout.length; r++) {
            for (let c = 0; c < layout[r].length; c++) {
                const char = layout[r][c];
                const dy = anchor.r - r;
                const dLat = c - anchor.c;
                
                let tx = match.anchorBlock.x;
                let ty = match.anchorBlock.y + dy;
                let tz = match.anchorBlock.z;
                
                if (axis === 'x') tx += dLat;
                else tz += dLat;
                
                const bLoc = { x: tx, y: ty, z: tz };
                if (char === '.' || char === '*') portalBlocks.push(bLoc);
                else if (char === 'X') frameBlocks.push(bLoc);
            }
        }

        let cx = 0, cy = 0, cz = 0;
        portalBlocks.forEach(pb => { cx += pb.x; cy += pb.y; cz += pb.z; });
        const portalCenter = portalBlocks.length > 0 ? { x: cx / portalBlocks.length, y: cy / portalBlocks.length, z: cz / portalBlocks.length } : match.anchorBlock;

        const signLoc = { x: signBlock.x, y: signBlock.y, z: signBlock.z, dim: dimId };
        
        let buttonLoc = null;
        const gateDim = world.getDimension(dimId);
        for (const anc of allAnchors) {
            if (anc.x === signBlock.x && anc.y === signBlock.y && anc.z === signBlock.z) continue;
            try {
                const b = gateDim.getBlock(anc);
                if (b && b.typeId.includes("button")) {
                    buttonLoc = { x: anc.x, y: anc.y, z: anc.z, dim: dimId };
                    break;
                }
            } catch (e) {}
        }

        let exitDirection = { x: 0, y: 0, z: 0, rotY: 0 };
        if (axis === 'x') {
            exitDirection = { x: 0, y: 0, z: 1.5, rotY: 0 };
        } else {
            exitDirection = { x: 1.5, y: 0, z: 0, rotY: 90 };
        }

        const signComp = signBlock.getComponent("minecraft:sign");
        let flags = "";
        if (signComp) {
            const parsedText = this.parseStargateSignText(signComp.getText());
            if (parsedText) flags = parsedText.flags || "";
        }

        const key = this.getGateKey(match.anchorBlock);
        const data = {
            id: gateDef.id,
            name: name,
            network: network,
            creator: player.name,
            creatorId: player.id,
            flags: flags,
            location: { x: match.anchorBlock.x, y: match.anchorBlock.y, z: match.anchorBlock.z, dim: dimId },
            axis: axis,
            signLocation: signLoc,
            buttonLocation: buttonLoc,
            portalBlocks: portalBlocks,
            frameBlocks: frameBlocks,
            portalCenter: portalCenter,
            exitDirection: exitDirection,
            portalOpenMat: gateDef.config?.['portal-open'] || "minecraft:basic_flame_particle",
            portalClosedMat: gateDef.config?.['portal-closed'] || "minecraft:air"
        };

        this.saveGateData(key, data);
        
        this.gatesCache = null;
        this.getAllGatesMap();

        player.sendMessage(`§aStargate §e${name}§a on network §e${network}§a has been successfully established and registered!§r`);
        
        this.setSignText(signLoc, name, network, [name]);
        if (buttonLoc) {
            this.healButton(data, gateDim);
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
            creator: player.name,
            creatorId: player.id,
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

        let index = 0;

        const placeNextBlock = () => {
            if (index >= blocksToPlace.length) {
                // Summoning finished
                const finalCost = GateManager.calculateGateXpCost(gateDef, player);
                if (player.getGameMode() !== "creative") {
                    try {
                        player.addLevels(-finalCost);
                    } catch (e) {
                        console.warn(`Failed to deduct Levels: ${e}`);
                    }
                    player.sendMessage(`§6Stargate summoning complete!§r Cost: §e${finalCost} Levels§r.`);
                } else {
                    player.sendMessage(`§6Stargate summoning complete!§r (Creative Mode: Free)`);
                }

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
                    this.consumeItem(player, mat);
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

    static consumeItem(player, typeId) {
        if (player.getGameMode() === "creative") return true;
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

    static damageCastingGuide(player) {
        if (player.getGameMode() === "creative") return;
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

    /**
     * Calculates the Level cost for summoning a gate.
     * @returns {number} Level cost (0-30)
     */
    static calculateGateXpCost(gateDef, player) {
        if (!gateDef || !gateDef.layout || !player) return 0;
        if (player.getGameMode() === "creative") return 0;

        const inv = player.getComponent("minecraft:inventory")?.container;
        const available = {};
        if (inv) {
            for (let i = 0; i < inv.size; i++) {
                const item = inv.getItem(i);
                if (item) {
                    available[item.typeId] = (available[item.typeId] || 0) + item.amount;
                }
            }
        }

        let totalCost = 0;
        for (const row of gateDef.layout) {
            for (const char of row) {
                if (char === ' ') continue;
                let mat = gateDef.materials[char];
                if (char === '.') mat = gateDef.config['portal-closed'];

                if (mat && mat !== "minecraft:air") {
                    if (available[mat] && available[mat] > 0) {
                        totalCost += 1;
                        available[mat]--;
                    } else {
                        totalCost += 5;
                    }
                }
            }
        }
        // Normalize to Levels (capped at 30, roughly matches enchantment logic)
        return Math.min(Math.ceil(totalCost / 5), 30);
    }

    static hasGateBuilderPermission(player) {
        return true; // Any and all players can construct and establish stargates!
    }

    static hasGateControlPermission(player, gate) {
        if (!player) return false;
        if (player.getGameMode() === "creative" || player.hasTag("stargate_admin")) return true;
        if (gate.creatorId && gate.creatorId === player.id) return true;
        if (gate.creator && gate.creator === player.name) return true;
        if (!gate.creator && this.hasGateBuilderPermission(player)) return true;
        return false;
    }

    static findAlwaysOnDestination(gate) {
        const allGates = this.getAllGatesMap();
        const targets = Object.values(allGates).filter(g => g.network === gate.network && g.name !== gate.name);
        if (targets.length > 0) {
            return targets[0]; // Target the other gate on the network
        }
        return null;
    }

    static teleportRandomly(player, gate) {
        const now = Date.now();
        const lastTeleport = this.recentTeleports.get(player.id) || 0;
        if (now - lastTeleport < 1000) return; // 1 second cooldown
        this.recentTeleports.set(player.id, now);

        const dim = world.getDimension(gate.location.dim);
        if (!dim) return;

        const rx = (Math.random() - 0.5) * 10000;
        const rz = (Math.random() - 0.5) * 10000;
        const ry = 80;

        const hasQ = gate.flags && gate.flags.toUpperCase().includes('Q');

        try {
            if (!hasQ) {
                player.sendMessage("§aEntering unstable gate... Teleporting to random coordinates!§r");
            }
            player.teleport({ x: rx, y: ry, z: rz }, { dimension: dim });
        } catch (e) {}
    }
}
