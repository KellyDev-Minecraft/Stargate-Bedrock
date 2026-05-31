import { world, BlockPermutation, system } from "@minecraft/server";
import { GateDefinitions } from "./data/gate_definitions.js";

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
            if (parsed && (parsed.name !== gate.name || parsed.network !== gate.network || parsed.flags !== (gate.flags || ""))) {
                console.warn(`[Stargate] Real-time sign update: ${gate.name} -> ${parsed.name} (network: ${parsed.network})`);
                const key = this.getGateKey({ dimension: { id: gate.location.dim }, x: gate.location.x, y: gate.location.y, z: gate.location.z });
                gate.name = parsed.name;
                gate.network = parsed.network;
                gate.flags = parsed.flags;
                gate.options = this.parseFlagsToOptions(parsed.flags);
                this.saveGateData(key, gate);
                this.gatesCache = null;
                this.getAllGatesMap();
            }
        }

        // Check if gate is Private ('P')
        const opts = gate.options || {};
        if (opts.private && !this.hasGateControlPermission(player, gate)) {
            player.sendMessage("§cThis Stargate is private and can only be accessed by its owner!§r");
            return;
        }

        // Always-on gates ('A', 'R', 'U') cannot be manually dialed
        if (opts.alwaysOn) {
            player.sendMessage("§eThis Stargate is always active. Walk in to teleport!§r");
            return;
        }

        // If not always-on, ensure we have a button location
        if (!gate.buttonLocation) {
            const discoveredLoc = this.discoverButtonLocation(gate, signBlock);
            if (discoveredLoc) {
                gate.buttonLocation = discoveredLoc;
                const key = this.getGateKey({ dimension: { id: gate.location.dim }, x: gate.location.x, y: gate.location.y, z: gate.location.z });
                this.saveGateData(key, gate);
                this.gatesCache = null;
                this.getAllGatesMap();
                console.warn(`[Stargate] Discovered button location for ${gate.name} at ${discoveredLoc.x},${discoveredLoc.y},${discoveredLoc.z}`);
            } else {
                player.sendMessage("§cNo button found for this gate! Place a button on the other control block (-).§r");
                return;
            }
        }

        // Find existing priming for this player and gate
        let prime = this.primedGates.find(p => p.player.id === player.id && p.source.location.x === gate.location.x && p.source.location.y === gate.location.y && p.source.location.z === gate.location.z);

        if (!prime) {
            // First time tapping: Start Priming
            console.warn(`Starting priming for ${gate.name}`);
            const allGates = this.getAllGatesMap();
            // Filter out hidden ('H') gates unless the caller is the owner
            const targets = Object.values(allGates).filter(g => {
                if (g.network !== gate.network || g.name === gate.name) return false;
                const targetOpts = g.options || {};
                if (targetOpts.private && g.ownerId !== player.id) return false;
                if (targetOpts.hidden && !targetOpts.show && g.ownerId !== player.id) return false;
                return true;
            });

            if (targets.length === 0) {
                player.sendMessage(`No other reachable gates found on network '${gate.network}'.`);
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
        this.setSignText(gate.signLocation, gate.name, gate.network, [gate.name, ...targetNames], prime.selectedTargetIndex, false, gate.options);

        // Ensure button exists (Heal if missing)
        this.healButton(gate, signBlock.dimension);
    }

    static findGateBySign(signBlock) {
        const allGates = this.getAllGatesMap();
        for (const key in allGates) {
            const gate = allGates[key];
            if (gate.signLocation &&
                gate.signLocation.x === signBlock.x &&
                gate.signLocation.y === signBlock.y &&
                gate.signLocation.z === signBlock.z &&
                (!gate.signLocation.dim || gate.signLocation.dim === signBlock.dimension.id)) {
                return gate;
            }
        }
        return null;
    }

    static findGateByBlock(block) {
        const allGates = this.getAllGatesMap();
        const dimId = block.dimension.id;

        for (const key in allGates) {
            const gate = allGates[key];

            // Check sign
            if (gate.signLocation &&
                gate.signLocation.x === block.x &&
                gate.signLocation.y === block.y &&
                gate.signLocation.z === block.z) {
                if (!gate.signLocation.dim || gate.signLocation.dim === dimId) {
                    return { key, gate };
                }
            }

            // Check frame
            if (gate.frameBlocks) {
                const isFrame = gate.frameBlocks.some(fb =>
                    fb.x === block.x && fb.y === block.y && fb.z === block.z &&
                    (gate.location.dim === undefined || gate.location.dim === dimId)
                );
                if (isFrame) return { key, gate };
            }
        }
        return null;
    }

    static getAttachedBlock(block) {
        const perm = block.permutation;
        let dir = { x: 0, y: 0, z: 0 };

        // Wall signs and buttons use "facing" (string) or "facing_direction" (int)
        const facingStr = perm.getState("facing");
        if (facingStr) {
            switch (facingStr) {
                case "north": dir.z = 1; break;
                case "south": dir.z = -1; break;
                case "west": dir.x = 1; break;
                case "east": dir.x = -1; break;
            }
        } else {
            const facingEnv = perm.getState("facing_direction");
            if (facingEnv !== undefined && facingEnv >= 2) {
                if (facingEnv === 2) dir.z = 1;
                else if (facingEnv === 3) dir.z = -1;
                else if (facingEnv === 4) dir.x = 1;
                else if (facingEnv === 5) dir.x = -1;
            } else {
                // Standing signs use "ground_sign_direction" — attached to block below
                const groundDir = perm.getState("ground_sign_direction");
                if (groundDir !== undefined) {
                    dir.y = -1;
                }
            }
        }

        return block.dimension.getBlock({
            x: block.x + dir.x,
            y: block.y + dir.y,
            z: block.z + dir.z
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
            if (this.checkMatch(gateDef, anchorBlock, layoutAnchor, layout, 'x')) {
                return {
                    gateDef,
                    axis: 'x',
                    matchedAnchor: layoutAnchor,
                    anchorBlock,
                    allAnchors: this.getAllWorldAnchors(gateDef, anchorBlock, layoutAnchor, 'x')
                };
            }
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
        for (let r = 0; r < layout.length; r++) {
            const rowStr = layout[r];
            for (let c = 0; c < rowStr.length; c++) {
                const char = rowStr[c];
                if (char === ' ') continue;

                const dLat = c - layoutAnchor.c;

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

                if (!this.matchesMaterial(char, block, gateDef)) {
                    return false;
                }
            }
        }
        return true;
    }

    static matchesMaterial(char, block, gateDef) {
        const blockId = block.typeId;

        if (char === '-') {
            const materials = Object.values(gateDef.materials);
            return materials.some(mat => blockId === mat || blockId.includes(mat.replace('minecraft:', '')));
        } else if (char === '.') {
            return true;
        } else if (gateDef.materials[char]) {
            const expectedMat = gateDef.materials[char];
            if (expectedMat === 'minecraft:air' && block.isAir) return true;
            return blockId === expectedMat || blockId.includes(expectedMat.replace('minecraft:', ''));
        }

        return false;
    }

    static setSignText(loc, name, network, targets, selectedIndex = -1, isActive = false, options = {}) {
        const dim = world.getDimension(loc.dim);
        if (!dim) return;
        const block = dim.getBlock(loc);
        if (!block) return;

        const sign = block.getComponent("minecraft:sign");
        if (sign) {
            let text = "";
            const targetList = targets.filter(t => t !== name);

            const hasN = options.noNetwork;
            const netDisp = hasN ? "------------" : network;

            if (isActive) {
                const dest = targets[0] || "Unknown";
                text = `§1-${name}-\n§c>> ACTIVE <<\n§4${dest}`;
            } else if (selectedIndex === -1) {
                text = `§1-${name}-\n§8------------\n§3${netDisp}`;
                let flagsStr = "";
                if (options.alwaysOn) {
                    flagsStr += options.random ? "R" : (options.bungee ? "U" : "A");
                }
                if (options.hidden) flagsStr += "H";
                if (options.private) flagsStr += "P";
                if (options.backwards) flagsStr += "B";
                if (options.quiet) flagsStr += "Q";
                if (options.noNetwork) flagsStr += "N";
                if (flagsStr) {
                    text += `\n§5${flagsStr}`;
                }
            } else {
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

    static handleButtonInteraction(buttonBlock, player) {
        console.warn(`handleButtonInteraction: Button pressed by ${player.name}`);

        const primeIdx = this.primedGates.findIndex(p => {
            if (p.player.id !== player.id) return false;
            if (!p.source.buttonLocation) return false;
            const b = p.source.buttonLocation;
            return b.x === buttonBlock.x && b.y === buttonBlock.y && b.z === buttonBlock.z && b.dim === buttonBlock.dimension.id;
        });

        if (primeIdx !== -1) {
            const prime = this.primedGates[primeIdx];
            const targetGate = prime.targets[prime.selectedTargetIndex];
            this.activateGate(prime.source, targetGate, player);
            this.primedGates.splice(primeIdx, 1);
        } else {
            const allGates = this.getAllGatesMap();
            const gate = Object.values(allGates).find(g => {
                if (!g.buttonLocation) return false;
                return g.buttonLocation.x === buttonBlock.x &&
                    g.buttonLocation.y === buttonBlock.y &&
                    g.buttonLocation.z === buttonBlock.z &&
                    g.buttonLocation.dim === buttonBlock.dimension.id;
            });
            if (gate) {
                player.sendMessage("§7Select a destination on the sign first.");
            }
        }
    }

    static activateGate(sourceGate, targetGate, player) {
        console.warn(`Activating gate ${sourceGate.name} -> ${targetGate.name}`);

        sourceGate.isActive = true;
        targetGate.isActive = true;
        const sKey = this.getGateKey({ dimension: { id: sourceGate.location.dim }, x: sourceGate.location.x, y: sourceGate.location.y, z: sourceGate.location.z });
        const tKey = this.getGateKey({ dimension: { id: targetGate.location.dim }, x: targetGate.location.x, y: targetGate.location.y, z: targetGate.location.z });
        this.saveGateData(sKey, sourceGate);
        this.saveGateData(tKey, targetGate);

        this.setPortalBlocks(sourceGate, true);
        this.setPortalBlocks(targetGate, true);

        this.createTransientTickingArea(sourceGate);
        this.createTransientTickingArea(targetGate);

        this.activePortals.push({
            gate: sourceGate,
            target: targetGate,
            ticksRemaining: 100 // 5 seconds
        });

        if (sourceGate.signLocation) {
            this.setSignText(sourceGate.signLocation, sourceGate.name, sourceGate.network, [targetGate.name], 0, true, sourceGate.options);
        }
        if (targetGate.signLocation) {
            this.setSignText(targetGate.signLocation, targetGate.name, targetGate.network, [sourceGate.name], 0, true, targetGate.options);
        }

        player.sendMessage(`§aGate Active! Destination: ${targetGate.name}`);
    }

    static createTransientTickingArea(gate) {
        try {
            const dim = world.getDimension(gate.location.dim);
            const name = `sg_active_${gate.location.x}_${gate.location.y}_${gate.location.z}`.replace(/-/g, '_');
            dim.runCommandAsync(`tickingarea add circle ${gate.location.x} ${gate.location.y} ${gate.location.z} 2 ${name} true`);
        } catch (e) {
            console.warn(`Failed to create ticking area: ${e}`);
        }
    }

    static removeTransientTickingArea(gate) {
        try {
            const dim = world.getDimension(gate.location.dim);
            const name = `sg_active_${gate.location.x}_${gate.location.y}_${gate.location.z}`.replace(/-/g, '_');
            dim.runCommandAsync(`tickingarea remove ${name}`);
        } catch (e) { }
    }

    static setPortalBlocks(gate, isOpen) {
        if (!gate.portalBlocks) return;
        const dim = world.getDimension(gate.location.dim);
        if (!dim) return;

        const gateDef = GateDefinitions.find(d => d.id === gate.id);
        let openMat = "minecraft:basic_flame_particle";
        let closedMat = "minecraft:air";

        if (gateDef && gateDef.config) {
            openMat = gateDef.config['portal-open'] || openMat;
            closedMat = gateDef.config['portal-closed'] || closedMat;
        } else {
            openMat = gate.portalOpenMat || openMat;
            closedMat = gate.portalClosedMat || closedMat;
        }

        let blockType = isOpen ? openMat : closedMat;

        for (const pb of gate.portalBlocks) {
            try {
                const block = dim.getBlock(pb);
                if (block) {
                    let permutation;
                    try {
                        permutation = BlockPermutation.resolve(blockType);
                    } catch (e) {
                        permutation = BlockPermutation.resolve("minecraft:air");
                    }
                    block.setPermutation(permutation);
                }
            } catch (e) { }
        }
    }

    static tick() {
        this.tickCounter++;

        // Periodic cleanup of stale teleport cooldowns
        if (this.tickCounter % 200 === 0 && this.recentTeleports.size > 0) {
            const now = Date.now();
            for (const [id, time] of this.recentTeleports) {
                if (now - time > 5000) this.recentTeleports.delete(id);
            }
        }

        // 1. Handle Primed Gates
        if (this.primedGates.length > 0) {
            for (let i = this.primedGates.length - 1; i >= 0; i--) {
                const p = this.primedGates[i];
                p.ticksLeft--;
                if (p.ticksLeft <= 0) {
                    if (p.source.signLocation) {
                        this.setSignText(p.source.signLocation, p.source.name, p.source.network, [p.source.name], -1, false, p.source.options);
                    }
                    try { p.player.sendMessage(`§cActivation window for ${p.source.name} expired.`); } catch (e) { }
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

                const sourceOpts = ap.gate.options || {};
                const targetOpts = ap.target.options || {};
                if (sourceOpts.alwaysOn || targetOpts.alwaysOn) {
                    ap.ticksRemaining = 100; // Never expires
                }

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
                    this.setPortalBlocks(ap.target, false);

                    if (ap.gate.signLocation) {
                        this.setSignText(ap.gate.signLocation, ap.gate.name, ap.gate.network, [ap.gate.name], -1, false, ap.gate.options);
                    }
                    if (ap.target.signLocation) {
                        this.setSignText(ap.target.signLocation, ap.target.name, ap.target.network, [ap.target.name], -1, false, ap.target.options);
                    }

                    ap.gate.isActive = false;
                    ap.target.isActive = false;
                    const sKey = this.getGateKey({ dimension: { id: ap.gate.location.dim }, x: ap.gate.location.x, y: ap.gate.location.y, z: ap.gate.location.z });
                    const tKey = this.getGateKey({ dimension: { id: ap.target.location.dim }, x: ap.target.location.x, y: ap.target.location.y, z: ap.target.location.z });
                    this.saveGateData(sKey, ap.gate);
                    this.saveGateData(tKey, ap.target);

                    this.removeTransientTickingArea(ap.gate);
                    this.removeTransientTickingArea(ap.target);

                    this.activePortals.splice(i, 1);
                    continue;
                }

                // Teleportation Logic
                [ap.gate, ap.target].forEach((source, idx) => {
                    const dest = idx === 0 ? ap.target : ap.gate;
                    const dim = world.getDimension(source.location.dim);

                    if (dim) {
                        const gateDef = GateDefinitions.find(d => d.id === source.id);
                        let particleId = "minecraft:basic_flame_particle";
                        if (gateDef && gateDef.config && gateDef.config['portal-open']) {
                            try {
                                BlockPermutation.resolve(gateDef.config['portal-open']);
                                particleId = null;
                            } catch (e) {
                                particleId = gateDef.config['portal-open'];
                            }
                        }

                        if (particleId) {
                            try {
                                for (let p = 0; p < 2; p++) {
                                    const randBlock = source.portalBlocks[Math.floor(Math.random() * source.portalBlocks.length)];
                                    dim.spawnParticle(particleId, { x: randBlock.x + Math.random(), y: randBlock.y + Math.random(), z: randBlock.z + Math.random() });
                                }
                            } catch (e) { }
                        }

                        const players = dim.getPlayers({ location: source.location, maxDistance: 8 });
                        for (const p of players) {
                            const pLoc = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
                            if (source.portalBlocks.some(pb => pb.x === pLoc.x && pb.y === pLoc.y && pb.z === pLoc.z)) {
                                this.teleportPlayer(p, dest);
                            }
                        }
                    }
                });
            }
        }

        // 3. Handle Permanent / Always-On Gates ('A', 'R', 'U')
        const checkPermanents = this.tickCounter % 5 === 0;
        if (checkPermanents) {
            const allGates = this.getAllGatesMap();
            for (const key in allGates) {
                const gate = allGates[key];
                const opts = gate.options || {};

                if (opts.alwaysOn) {
                    if (this.tickCounter % 100 === 0) {
                        this.setPortalBlocks(gate, true);
                    }

                    const dim = world.getDimension(gate.location.dim);
                    if (dim) {
                        const isQuiet = opts.quiet;
                        if (!isQuiet && this.tickCounter % 10 === 0 && gate.portalBlocks && gate.portalBlocks.length > 0) {
                            try {
                                const randBlock = gate.portalBlocks[Math.floor(Math.random() * gate.portalBlocks.length)];
                                dim.spawnParticle("minecraft:basic_flame_particle", { x: randBlock.x + Math.random(), y: randBlock.y + Math.random(), z: randBlock.z + Math.random() });
                            } catch (e) {}
                        }

                        const players = dim.getPlayers({ location: gate.location, maxDistance: 8 });
                        for (const p of players) {
                            const pLoc = { x: Math.floor(p.location.x), y: Math.floor(p.location.y), z: Math.floor(p.location.z) };
                            if (gate.portalBlocks.some(pb => pb.x === pLoc.x && pb.y === pLoc.y && pb.z === pLoc.z)) {
                                if (opts.random) {
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

    static teleportPlayer(player, targetGate) {
        const now = Date.now();
        const lastTeleport = this.recentTeleports.get(player.id) || 0;
        if (now - lastTeleport < 1000) return;

        const dim = world.getDimension(targetGate.location.dim);
        if (!dim) return;

        this.recentTeleports.set(player.id, now);

        let baseLoc = targetGate.portalCenter || targetGate.location;
        let tx = baseLoc.x + 0.5;
        let ty = baseLoc.y;
        let tz = baseLoc.z + 0.5;
        let rotY = 0;

        const opts = targetGate.options || {};
        let directionMultiplier = opts.backwards ? -1.5 : 1.5;

        if (targetGate.exitDirection) {
            tx += targetGate.exitDirection.x * directionMultiplier;
            ty += targetGate.exitDirection.y;
            tz += targetGate.exitDirection.z * directionMultiplier;
            rotY = targetGate.exitDirection.rotY || 0;
            if (opts.backwards) rotY = (rotY + 180) % 360;
        } else {
            if (targetGate.axis === 'x') {
                tz += 2.0 * (opts.backwards ? -1 : 1);
                rotY = opts.backwards ? 180 : 0;
            } else {
                tx += 2.0 * (opts.backwards ? -1 : 1);
                rotY = opts.backwards ? 270 : 90;
            }
        }

        try {
            if (!opts.quiet) {
                player.sendMessage(`§eTeleporting to ${targetGate.name}...`);
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
        if (this.gatesCache && this.gatesCache[key]) return this.gatesCache[key];
        const allGates = this.getAllGatesMap();
        return allGates[key] || null;
    }

    static saveGateData(key, data) {
        const db = this.getDatabaseEntity();
        if (!db) return;

        if (!this.gatesCache) this.gatesCache = {};
        this.gatesCache[key] = data;

        const prefix = `gate:${key}|`;
        for (const tag of db.getTags()) {
            if (tag.startsWith(prefix)) db.removeTag(tag);
        }

        const json = JSON.stringify(data);
        const CHUNK_SIZE = 150;
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

        const tags = db.getTags();
        const fragments = {};
        for (const tag of tags) {
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
                            if (parsed && (parsed.name !== gate.name || parsed.network !== gate.network || parsed.flags !== (gate.flags || ""))) {
                                console.warn(`[Stargate] Sign update detected for gate: ${gate.name} -> ${parsed.name} (network: ${parsed.network})`);
                                gate.name = parsed.name;
                                gate.network = parsed.network;
                                gate.flags = parsed.flags;
                                gate.options = this.parseFlagsToOptions(parsed.flags);
                                this.saveGateData(key, gate);
                                // Don't overwrite sign text here — let the next right-click
                                // interaction format it, so manual edits aren't clobbered
                            } else if (!gate.isActive && !currentText.includes(gate.name)) {
                                this.setSignText(gate.signLocation, gate.name, gate.network, [gate.name], -1, false, gate.options);
                            }
                        }
                    }
                }

                // Active Check & Persistent Cleanups
                const isCurrentlyActive = this.activePortals.some(ap =>
                    (ap.gate.location.x === gate.location.x && ap.gate.location.y === gate.location.y && ap.gate.location.z === gate.location.z && ap.gate.location.dim === gate.location.dim) ||
                    (ap.target.location.x === gate.location.x && ap.target.location.y === gate.location.y && ap.target.location.z === gate.location.z && ap.target.location.dim === gate.location.dim)
                );

                if (gate.isActive && !isCurrentlyActive) {
                    this.setPortalBlocks(gate, false);
                    gate.isActive = false;
                    this.saveGateData(key, gate);
                    if (gate.signLocation) {
                        this.setSignText(gate.signLocation, gate.name, gate.network, [gate.name], -1, false, gate.options);
                    }
                    this.removeTransientTickingArea(gate);
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

                this.healButton(gate, dim);
            } catch (e) { }
        }

        // Refresh DB entity invisibility so it never expires on long-running servers
        try {
            const db = this.getDatabaseEntity();
            if (db) {
                db.addEffect("invisibility", 20000000, { amplifier: 1, showParticles: false });
            }
        } catch (e) { }
    }

    static healButton(gate, dim) {
        if (!gate.buttonLocation) return;
        try {
            const buttonBlock = dim.getBlock(gate.buttonLocation);
            if (buttonBlock && (buttonBlock.isAir || !buttonBlock.typeId.includes("button"))) {
                let buttonType = "minecraft:wooden_button";
                const gateDef = GateDefinitions.find(d => d.id === gate.id);
                if (gateDef && gateDef.config && gateDef.config.button) {
                    buttonType = gateDef.config.button;
                }

                buttonBlock.setType(buttonType);

                if (gate.exitDirection) {
                    let facingDir = 3;
                    if (gate.exitDirection.rotY === 180) facingDir = 2;
                    else if (gate.exitDirection.rotY === 90) facingDir = 5;
                    else if (gate.exitDirection.rotY === 270) facingDir = 4;

                    try {
                        const perm = BlockPermutation.resolve(buttonType, { "facing_direction": facingDir });
                        buttonBlock.setPermutation(perm);
                    } catch (e) { }
                }
            }
        } catch (e) { }
    }

    /**
     * Scans the gate pattern to find the button location when it's missing.
     * Uses the sign position and gate layout to find the other control point (-).
     */
    static discoverButtonLocation(gate, signBlock) {
        const gateDef = GateDefinitions.find(d => d.id === gate.id);
        if (!gateDef) return null;

        const dim = signBlock.dimension;
        const anchorBlock = dim.getBlock(gate.location);
        if (!anchorBlock) return null;

        const match = this.matchGatePattern(gateDef, anchorBlock);
        if (!match) return null;

        const allAnchors = match.allAnchors;
        if (!allAnchors || allAnchors.length < 2) return null;

        // Find the anchor closest to the sign (that's the sign's control point)
        let signAnchor = null;
        let minDist = 99999;
        for (const anc of allAnchors) {
            const dist = Math.abs(anc.x - signBlock.x) + Math.abs(anc.y - signBlock.y) + Math.abs(anc.z - signBlock.z);
            if (dist < minDist) {
                minDist = dist;
                signAnchor = anc;
            }
        }

        // The sign offset from its anchor
        const offset = {
            x: signBlock.x - signAnchor.x,
            y: signBlock.y - signAnchor.y,
            z: signBlock.z - signAnchor.z
        };

        // Find the other anchor (button's control point)
        let buttonAnchor = null;
        for (const a of allAnchors) {
            if (a.x !== signAnchor.x || a.y !== signAnchor.y || a.z !== signAnchor.z) {
                buttonAnchor = a;
                break;
            }
        }
        if (!buttonAnchor) return null;

        // Button location mirrors the sign's offset on the other anchor
        const buttonLoc = {
            x: buttonAnchor.x + offset.x,
            y: buttonAnchor.y + offset.y,
            z: buttonAnchor.z + offset.z,
            dim: gate.location.dim
        };

        // Verify there's actually a button there, or at least the space exists
        try {
            const block = dim.getBlock(buttonLoc);
            if (block) return buttonLoc;
        } catch (e) { }

        return null;
    }

    static deleteGate(key) {
        // Clean up active portals and primed gates referencing this gate
        if (this.gatesCache && this.gatesCache[key]) {
            const gate = this.gatesCache[key];
            const loc = gate.location;

            // Close portal blocks for this gate
            try { this.setPortalBlocks(gate, false); } catch (e) { }
            this.removeTransientTickingArea(gate);

            // Remove from active portals and clean up the paired gate
            for (let i = this.activePortals.length - 1; i >= 0; i--) {
                const ap = this.activePortals[i];
                const isSource = ap.gate.location.x === loc.x && ap.gate.location.y === loc.y && ap.gate.location.z === loc.z && ap.gate.location.dim === loc.dim;
                const isTarget = ap.target.location.x === loc.x && ap.target.location.y === loc.y && ap.target.location.z === loc.z && ap.target.location.dim === loc.dim;
                if (isSource || isTarget) {
                    const other = isSource ? ap.target : ap.gate;
                    try { this.setPortalBlocks(other, false); } catch (e) { }
                    other.isActive = false;
                    if (other.signLocation) {
                        try { this.setSignText(other.signLocation, other.name, other.network, [other.name], -1, false, other.options); } catch (e) { }
                    }
                    this.removeTransientTickingArea(other);
                    this.activePortals.splice(i, 1);
                }
            }

            // Remove from primed gates
            for (let i = this.primedGates.length - 1; i >= 0; i--) {
                const p = this.primedGates[i];
                if (p.source.location.x === loc.x && p.source.location.y === loc.y && p.source.location.z === loc.z && p.source.location.dim === loc.dim) {
                    this.primedGates.splice(i, 1);
                }
            }
        }

        if (this.gatesCache) delete this.gatesCache[key];

        const db = this.getDatabaseEntity();
        if (!db) return;

        const prefix = `gate:${key}|`;
        for (const tag of db.getTags()) {
            if (tag.startsWith(prefix)) db.removeTag(tag);
        }
    }

    static getDatabaseEntity() {
        for (const dimName of ["overworld", "nether", "the_end"]) {
            try {
                const dim = world.getDimension(dimName);
                const entities = dim.getEntities({ tags: ["stargate_db"] });
                if (entities.length > 0) return entities[0];
            } catch (e) { }
        }

        const overworld = world.getDimension("overworld");
        try {
            const ent = overworld.spawnEntity("minecraft:armor_stand", { x: 0, y: -60, z: 0 });
            return this.initDbEntity(ent);
        } catch (e) {
            const players = overworld.getPlayers();
            if (players.length > 0) {
                try {
                    const ent = overworld.spawnEntity("minecraft:armor_stand", players[0].location);
                    return this.initDbEntity(ent);
                } catch (e2) { }
            }
        }
        return null;
    }

    static initDbEntity(ent) {
        ent.addTag("stargate_db");
        ent.nameTag = "StargateDB";
        ent.addEffect("invisibility", 20000000, { amplifier: 1, showParticles: false });
        console.warn("[Stargate] Created new StargateDB entity.");
        return ent;
    }

    static getAllGates() {
        return Object.keys(this.getAllGatesMap());
    }

    static parseStargateSignText(signText) {
        if (!signText) return null;
        
        const lines = signText.split('\n').map(l => l.trim());
        if (lines.length < 3) return null;

        const cleanLine = (str) => str.replace(/§[0-9a-fk-or]/gi, '').trim();

        const line1 = cleanLine(lines[0]);
        const line3 = cleanLine(lines[2]);
        const line4 = lines.length >= 4 ? cleanLine(lines[3]).toUpperCase() : "";

        if (line1.startsWith('-') && line1.endsWith('-') && line1.length > 2) {
            const name = line1.substring(1, line1.length - 1).trim();
            const network = line3.trim();
            if (name && network && network !== "------------") {
                return { name, network, flags: line4 };
            }
        }
        return null;
    }

    static parseFlagsToOptions(flags) {
        const f = flags ? flags.toUpperCase() : "";
        return {
            alwaysOn: f.includes('A') || f.includes('R') || f.includes('U'),
            random: f.includes('R'),
            hidden: f.includes('H'),
            private: f.includes('P'),
            backwards: f.includes('B'),
            quiet: f.includes('Q'),
            noNetwork: f.includes('N'),
            bungee: f.includes('U'),
            show: !f.includes('H')
        };
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
        
        // Find the anchor closest to the sign block
        let signAnchor = null;
        let minDistance = 99999;
        for (const anc of allAnchors) {
            const dist = Math.abs(anc.x - signBlock.x) + Math.abs(anc.y - signBlock.y) + Math.abs(anc.z - signBlock.z);
            if (dist < minDistance) {
                minDistance = dist;
                signAnchor = anc;
            }
        }

        // Calculate offset from that matched anchor block to the physical sign block
        const offset = signAnchor ? {
            x: signBlock.x - signAnchor.x,
            y: signBlock.y - signAnchor.y,
            z: signBlock.z - signAnchor.z
        } : { x: 0, y: 0, z: 0 };

        // Find the other anchor block where the button should reside
        let buttonAnchor = null;
        if (allAnchors && allAnchors.length > 1) {
            for (const a of allAnchors) {
                if (a.x !== signAnchor.x || a.y !== signAnchor.y || a.z !== signAnchor.z) {
                    buttonAnchor = a;
                    break;
                }
            }
        }
        if (!buttonAnchor) buttonAnchor = signAnchor || match.anchorBlock;

        // Button is located at the other anchor with the exact same offset
        const buttonLoc = {
            x: buttonAnchor.x + offset.x,
            y: buttonAnchor.y + offset.y,
            z: buttonAnchor.z + offset.z,
            dim: dimId
        };

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

        const options = this.parseFlagsToOptions(flags);

        const key = this.getGateKey(match.anchorBlock);
        const data = {
            id: gateDef.id,
            name: name,
            network: network,
            ownerId: player.id,
            axis: axis,
            location: { x: match.anchorBlock.x, y: match.anchorBlock.y, z: match.anchorBlock.z, dim: dimId },
            portalBlocks: portalBlocks,
            frameBlocks: frameBlocks,
            signLocation: signLoc,
            buttonLocation: buttonLoc,
            portalCenter: portalCenter,
            exitDirection: exitDirection,
            portalOpenMat: gateDef.config?.['portal-open'] || "minecraft:basic_flame_particle",
            portalClosedMat: gateDef.config?.['portal-closed'] || "minecraft:air",
            options: options,
            flags: flags,
            isActive: false
        };

        this.saveGateData(key, data);
        
        this.gatesCache = null;
        this.getAllGatesMap();

        player.sendMessage(`§aStargate §e${name}§a on network §e${network}§a has been successfully established and registered!§r`);
        
        this.setSignText(signLoc, name, network, [name], -1, false, options);
        if (buttonLoc) {
            this.healButton(data, signBlock.dimension);
        }
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
        const xpCost = this.calculateGateXpCost(gateDef, player);

        const layout = gateDef.layout;
        let blocksToPlace = [];
        let controlLocations = [];

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

                if (char === '-') {
                    controlLocations.push({ x: tx, y: ty, z: tz });
                }

                blocksToPlace.push({ x: tx, y: ty, z: tz, mat });
            }
        }

        let index = 0;

        const placeNextBlock = () => {
            if (index >= blocksToPlace.length) {
                const finalCost = xpCost;
                if (player.getGameMode() !== "creative") {
                    try {
                        player.addLevels(-finalCost);
                    } catch (e) { }
                    player.sendMessage(`§6Stargate summoning complete!§r Cost: §e${finalCost} Levels§r.`);
                } else {
                    player.sendMessage(`§6Stargate summoning complete!§r (Creative Mode: Free)`);
                }

                if (controlLocations.length > 0) {
                    this.autoPlaceControls(player, controlLocations, gateDef);
                }

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
                } catch (e) { }
            }

            index++;
            system.runTimeout(placeNextBlock, 1);
        };

        placeNextBlock();
    }

    static autoPlaceControls(player, controlLocs, gateDef) {
        const dim = player.dimension;
        const signType = "minecraft:wall_sign";

        console.warn(`Auto-placing controls: Sign=${signType}`);

        const rot = player.getRotation().y;
        let facingDirection = 2;
        let offset = { x: 0, y: 0, z: 0 };

        if (rot >= -45 && rot < 45) {
            facingDirection = 2; offset.z = -1;
        } else if (rot >= 45 && rot < 135) {
            facingDirection = 5; offset.x = 1;
        } else if (rot >= -135 && rot < -45) {
            facingDirection = 4; offset.x = -1;
        } else {
            facingDirection = 3; offset.z = 1;
        }

        if (controlLocs[0]) {
            const frameLoc = controlLocs[0];
            const signLoc = { x: frameLoc.x + offset.x, y: frameLoc.y + offset.y, z: frameLoc.z + offset.z };
            const block = dim.getBlock(signLoc);

            try {
                block.setType(signType);
                const signPerm = BlockPermutation.resolve(signType, { "facing_direction": facingDirection });
                block.setPermutation(signPerm);

                system.run(() => {
                    const signBlock = dim.getBlock(signLoc);
                    if (signBlock) {
                        const signComp = signBlock.getComponent("minecraft:sign");
                        if (signComp) {
                            signComp.setText("-Name-\n\nPublic");
                        }
                    }
                    player.sendMessage("§aSign placed! §eSneak + Right-click§a the sign to set your gate name and network, then §eRight-click§a to establish!§r");
                });
            } catch (e) { }
        }
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
        return Math.min(Math.ceil(totalCost / 5), 30);
    }

    static hasGateBuilderPermission(player) {
        return true;
    }

    static hasGateControlPermission(player, gate) {
        if (!player) return false;
        if (player.getGameMode() === "creative" || player.hasTag("stargate_admin")) return true;
        if (gate.ownerId && gate.ownerId === player.id) return true;
        if (gate.creatorId && gate.creatorId === player.id) return true;
        if (gate.creator && gate.creator === player.name) return true;
        return false;
    }

    static findAlwaysOnDestination(gate) {
        const allGates = this.getAllGatesMap();
        const targets = Object.values(allGates).filter(g => g.network === gate.network && g.name !== gate.name);
        if (targets.length > 0) {
            return targets[0];
        }
        return null;
    }

    static teleportRandomly(player, gate) {
        const now = Date.now();
        const lastTeleport = this.recentTeleports.get(player.id) || 0;
        if (now - lastTeleport < 1000) return;
        this.recentTeleports.set(player.id, now);

        const dim = world.getDimension(gate.location.dim);
        if (!dim) return;

        const rx = (Math.random() - 0.5) * 10000;
        const rz = (Math.random() - 0.5) * 10000;
        const ry = 80;

        const opts = gate.options || {};
        try {
            if (!opts.quiet) {
                player.sendMessage("§aEntering unstable gate... Teleporting to random coordinates!§r");
            }
            player.teleport({ x: rx, y: ry, z: rz }, { dimension: dim });
        } catch (e) {}
    }
}
