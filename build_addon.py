#!/usr/bin/env python3
import json
import zipfile
import os

BP_MANIFEST = "Stargate_BP/manifest.json"
RP_MANIFEST = "Stargate_RP/manifest.json"

def bump_version():
    """Increments the patch version in BP and syncs it to RP."""
    if not os.path.exists(BP_MANIFEST):
        print(f"Error: {BP_MANIFEST} not found.")
        return None

    with open(BP_MANIFEST, "r") as f:
        bp_data = json.load(f)

    # 1. Bump BP Version
    v = bp_data["header"]["version"]
    v[2] += 1
    new_version_str = f"{v[0]}.{v[1]}.{v[2]}"
    
    # Sync modules in BP
    for module in bp_data.get("modules", []):
        module["version"] = v

    # Update header name to include version (strip any existing trailing version)
    try:
        import re
        base_name = bp_data["header"].get("name", "").strip()
        # remove trailing " (x.y.z)" if present
        base_name = re.sub(r"\s*\(\d+\.\d+\.\d+\)$", "", base_name)
        bp_data["header"]["name"] = f"{base_name} ({new_version_str})"
    except Exception:
        pass

    with open(BP_MANIFEST, "w") as f:
        json.dump(bp_data, f, indent=2)
    
    print(f"Bumping version to {new_version_str}...")

    # 2. Sync to RP Version
    if os.path.exists(RP_MANIFEST):
        with open(RP_MANIFEST, "r") as f:
            rp_data = json.load(f)
        
        # Update header version
        rp_data["header"]["version"] = v
        
        # Update modules version
        for module in rp_data.get("modules", []):
            module["version"] = v
            
        # Update dependencies version (specifically the one pointing to BP)
        bp_uuid = bp_data["header"]["uuid"]
        for dep in rp_data.get("dependencies", []):
            if dep.get("uuid") == bp_uuid:
                dep["version"] = v
            elif "module_name" not in dep: # If it's a UUID dependency but not BP, maybe sync too? 
                                          # Usually RP-BP dependency is the main one.
                dep["version"] = v

        with open(RP_MANIFEST, "w") as f:
            # Also update RP header name to include version
            try:
                import re
                rbase = rp_data["header"].get("name", "").strip()
                rbase = re.sub(r"\s*\(\d+\.\d+\.\d+\)$", "", rbase)
                rp_data["header"]["name"] = f"{rbase} ({new_version_str})"
            except Exception:
                pass
            json.dump(rp_data, f, indent=4)
            
    return new_version_str

def build():
    version = bump_version()
    if not version:
        return

    filename = f"Stargate_Bedrock({version}).mcaddon"
    
    print(f"Building {filename}...")
    
    with zipfile.ZipFile(filename, "w", zipfile.ZIP_DEFLATED) as addon:
        # Add BP
        for root, dirs, files in os.walk("BP"):
            for file in files:
                addon.write(os.path.join(root, file))
        
        # Add RP
        for root, dirs, files in os.walk("RP"):
            for file in files:
                addon.write(os.path.join(root, file))
    
    print(f"Successfully created {filename}")

if __name__ == "__main__":
    build()
