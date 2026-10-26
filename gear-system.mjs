// GearSystem prototype for the hemu-ski outfit test.
// Mirrors the scheme in 01-换装系统方案.md §3: three kinds of items —
//   skinned : mesh re-bound to the base skeleton (bind), swap = swap mesh
//   socket  : rigid mesh authored in bind-pose model space, bone.attach() at load
//   hides   : wearing an item hides base-body regions named in its manifest entry
import * as THREE from 'three';

export class GearSystem {
  // baseScene: the partitioned base character's scene (SkeletonUtils-cloned in the game;
  // here the GLTFLoader output directly). Parts are the scene's SkinnedMeshes named base_<region>.
  constructor(baseScene) {
    this.root = baseScene;
    this.parts = new Map();   // region -> SkinnedMesh
    this.bones = new Map();   // short name -> Bone
    this.skeleton = null;
    baseScene.traverse((o) => {
      if (o.isSkinnedMesh) {
        const region = o.name.replace(/^base_/, '');
        this.parts.set(region, o);
        o.frustumCulled = false;
        if (!this.skeleton) this.skeleton = o.skeleton;
      }
      if (o.isBone) this.bones.set(o.name.replace(/^mixamorig:?/, ''), o);
    });
    if (!this.skeleton) throw new Error('base has no skeleton');
    this.worn = new Map(); // slot -> { spec, object }
  }

  bone(name) {
    const b = this.bones.get(name);
    if (!b) throw new Error(`no bone ${name}`);
    return b;
  }

  // gltfScene: a loaded GLB scene containing the item's mesh(es), in bind-pose model space.
  wear(spec, gltfScene) {
    this.unwear(spec.slot);
    const obj = new THREE.Group();
    obj.name = `gear_${spec.id}`;
    const meshes = [];
    gltfScene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    if (!meshes.length) throw new Error(`${spec.id}: no mesh`);

    if (spec.kind === 'skinned') {
      for (const m of meshes) {
        if (!m.isSkinnedMesh) throw new Error(`${spec.id}: skinned item must be a SkinnedMesh`);
        const part = m; // take the mesh, drop its own skeleton copy
        part.bind(this.skeleton, part.bindMatrix);
        part.frustumCulled = false;
        obj.add(part);
      }
      this.root.add(obj);
    } else if (spec.kind === 'socket') {
      // Authored in bind-pose model space: place at identity under the scene root first,
      // then attach() converts to bone-local while keeping the world transform.
      for (const m of meshes) { m.updateMatrixWorld(true); obj.attach ? null : null; }
      this.root.add(obj);
      for (const m of meshes) obj.add(m);
      obj.updateMatrixWorld(true);
      this.bone(spec.bone).attach(obj);
    } else {
      throw new Error(`${spec.id}: unknown kind ${spec.kind}`);
    }

    if (spec.palette) this.setPalette(spec.slot ?? spec.id, spec.palette, obj);
    if (spec.hides?.length) this.setRegionsVisible(spec.hides, false);
    this.worn.set(spec.slot, { spec, object: obj });
    return obj;
  }

  unwear(slot) {
    const cur = this.worn.get(slot);
    if (!cur) return;
    cur.object.removeFromParent();
    if (cur.spec.hides?.length) this.setRegionsVisible(cur.spec.hides, true);
    this.worn.delete(slot);
  }

  setPalette(slot, palette, objOverride = null) {
    const entry = objOverride ? { object: objOverride } : this.worn.get(slot);
    if (!entry) throw new Error(`slot ${slot} not worn`);
    entry.object.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (palette.main) o.material.color.set(palette.main);
    });
  }

  setRegionsVisible(regions, visible) {
    for (const r of regions) {
      const part = this.parts.get(r);
      if (part) part.visible = visible;
    }
  }

  visibleRegions() {
    return [...this.parts.entries()].filter(([, m]) => m.visible).map(([r]) => r);
  }
}
