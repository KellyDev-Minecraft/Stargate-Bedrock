#!/usr/bin/env python3
import os
import json
import zipfile
import subprocess
import shutil

def get_git_version():
    try:
        # Get total commit count for patch version
        count = subprocess.check_output(['git', 'rev-list', '--count', 'HEAD']).decode().strip()
        return int(count)
    except:
        print("Warning: Could not get git version, defaulting to 0")
        return 0

def update_manifest_version(manifest_data, patch_version):
    # Update header version
    if 'header' in manifest_data and 'version' in manifest_data['header']:
        current = manifest_data['header']['version']
        # Keep major/minor, replace patch
        manifest_data['header']['version'] = [current[0], current[1], patch_version]
    
    # Update modules version
    if 'modules' in manifest_data:
        for module in manifest_data['modules']:
            if 'version' in module:
                current = module['version']
                module['version'] = [current[0], current[1], patch_version]
    
    return manifest_data

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = script_dir # Now running from root
    
    gate_defs_dir = os.path.join(root_dir, "gate_definitions")
    bp_dir = os.path.join(root_dir, "Stargate_BP")
    rp_dir = os.path.join(root_dir, "Stargate_RP")
    
    # ensure scripts/data exists
    data_dir = os.path.join(bp_dir, "scripts", "data")
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
        
    # 1. Merge Gate Definitions
    gates = []
    if os.path.exists(gate_defs_dir):
        for f in os.listdir(gate_defs_dir):
            if f.endswith(".json"):
                with open(os.path.join(gate_defs_dir, f), 'r') as jf:
                    try:
                        gate_data = json.load(jf)
                        gates.append(gate_data)
                    except json.JSONDecodeError as e:
                        print(f"Error parsing {f}: {e}")

    # Write to JS file
    js_content = f"export const GateDefinitions = {json.dumps(gates, indent=4)};"
    with open(os.path.join(data_dir, "gate_definitions.js"), 'w') as f:
        f.write(js_content)
    
    print(f"Generated {len(gates)} gate definitions in scripts/data/gate_definitions.js")

    # 2. Determine Version
    patch_ver = get_git_version()
    print(f"Versioning: 1.0.{patch_ver}")

    # 3. Create MCADDON
    output_filename = f"Stargate_v1.0.{patch_ver}.mcaddon"
    output_path = os.path.join(root_dir, output_filename)
    
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Helper to add directory with manifest patching
        def add_pack_dir(pack_dir, archive_root):
            for root, dirs, files in os.walk(pack_dir):
                for file in files:
                    abs_path = os.path.join(root, file)
                    rel_path = os.path.relpath(abs_path, root_dir) # e.g. Stargate_BP/manifest.json
                    
                    # If manifest, enable patching
                    if file == "manifest.json":
                        with open(abs_path, 'r') as mf:
                            try:
                                data = json.load(mf)
                                data = update_manifest_version(data, patch_ver)
                                # Write modified content to zip
                                zipf.writestr(rel_path, json.dumps(data, indent=4))
                                continue
                            except Exception as e:
                                print(f"Error patching manifest {abs_path}: {e}")
                                # Fallback to normal write
                    
                    zipf.write(abs_path, rel_path)

        add_pack_dir(bp_dir, "Stargate_BP")
        add_pack_dir(rp_dir, "Stargate_RP")
                
    print(f"Created {output_filename}")
    
    # Make a generic 'latest' copy too
    latest_path = os.path.join(root_dir, "Stargate_latest.mcaddon")
    shutil.copyfile(output_path, latest_path)
    print(f"Updated {latest_path}")

if __name__ == "__main__":
    main()
