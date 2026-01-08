#!/usr/bin/env python3
import os
import json
import zipfile
import subprocess
import shutil

def get_git_info():
    try:
        # Get total commit count
        count = int(subprocess.check_output(['git', 'rev-list', '--count', 'HEAD']).decode().strip())
        # Check if dirty
        dirty = subprocess.check_output(['git', 'status', '--porcelain']).decode().strip() != ""
        return count, dirty
    except:
        print("Warning: Could not get git version, defaulting to 0")
        return 0, False

def get_dev_increment(is_dirty):
    if not is_dirty:
        return 0
    
    counter_file = ".dev_build_count"
    count = 0
    if os.path.exists(counter_file):
        with open(counter_file, 'r') as f:
            try:
                count = int(f.read().strip()) + 1
            except:
                count = 1
    else:
        count = 1
        
    with open(counter_file, 'w') as f:
        f.write(str(count))
    return count

def update_manifest_version(manifest_data, patch_version, dev_suffix=""):
    full_version_str = f"v1.1.{patch_version}{dev_suffix}"
    
    # Update header version and name
    if 'header' in manifest_data:
        if 'version' in manifest_data['header']:
            current = manifest_data['header']['version']
            manifest_data['header']['version'] = [current[0], current[1], patch_version]
        
        if 'name' in manifest_data['header']:
            base_name = manifest_data['header']['name']
            # Clean old version strings if any
            import re
            base_name = re.sub(r' v\d+\.\d+\.\d+(\+dev\d+)?', '', base_name)
            manifest_data['header']['name'] = f"{base_name} {full_version_str}"
    
    # Update modules version
    if 'modules' in manifest_data:
        for module in manifest_data['modules']:
            if 'version' in module:
                current = module['version']
                module['version'] = [current[0], current[1], patch_version]
    
    # Update internal dependencies
    internal_uuids = ["43916969-950c-4573-b328-765089309601", "685c4909-66c3-4d45-930c-720498309602"]
    if 'dependencies' in manifest_data:
        for dep in manifest_data['dependencies']:
            if 'uuid' in dep and dep['uuid'] in internal_uuids:
                if 'version' in dep:
                    current = dep['version']
                    dep['version'] = [current[0], current[1], patch_version]
    
    return manifest_data

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = script_dir # Now running from root
    
    bp_dir = os.path.join(root_dir, "Stargate_BP")
    rp_dir = os.path.join(root_dir, "Stargate_RP")

    # ensure scripts/data exists
    data_dir = os.path.join(bp_dir, "scripts", "data")
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
    
    # 2. Determine Version
    commit_count, is_dirty = get_git_info()
    dev_inc = get_dev_increment(is_dirty)
    patch_ver = commit_count + dev_inc
    dev_suffix = f"+dev{dev_inc-1}" if is_dirty else ""
    
    print(f"Versioning: 1.1.{patch_ver} {dev_suffix}".strip())

    # 3. Create MCADDON
    output_filename = f"Stargate_v1.1.{patch_ver}{dev_suffix}.mcaddon"
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
                                data = update_manifest_version(data, patch_ver, dev_suffix)
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
