/**
 * P7B additive adapter around the unchanged P6 WhiteBall3DRig.
 * The country's color/emblem/accessory come from one registry entry;
 * face geometry, expressive mouth, two detached 3D hands, animation,
 * lighting and contact-point squash remain P6 code.
 *
 * The emblem is a small extruded THREE geometry on the sphere, not a
 * CanvasTexture, billboard, SVG or externally sourced asset. Its exact
 * placement is a DEVELOPMENT proof and requires owner art acceptance.
 */
import * as THREE from 'three';
import {
  WB3D_BODY, WhiteBall3DRig, assertGenuine3DCharacter,
  type WhiteBall3DLighting, type WhiteBall3DState,
} from '../../npc/white-ball-3d';
import {
  assertNationalProfile, type NationalEmblem, type NationalProfile,
} from './profiles';

type Point = readonly [number, number];
const poly = (points: readonly Point[]): THREE.Shape => {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return shape;
};

const rect = (x0: number, y0: number, x1: number, y1: number) =>
  poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);

/** Each glyph is original procedural solid geometry. It does not reproduce any reference-image pixels. */
export function nationalEmblemShapes(emblem: NationalEmblem): readonly THREE.Shape[] {
  switch (emblem) {
    case 'airplane':
      return [poly([
        [0, 0.94], [-0.14, 0.05], [-0.83, -0.31],
        [-0.83, -0.51], [-0.09, -0.32], [-0.19, -0.82],
        [0, -0.94], [0.19, -0.82], [0.09, -0.32],
        [0.83, -0.51], [0.83, -0.31], [0.14, 0.05],
      ])];
    case 'skyscraper':
      return [
        rect(-0.72, -0.87, -0.3, 0.12),
        rect(-0.24, -0.87, 0.28, 0.90),
        rect(0.34, -0.87, 0.72, 0.43),
      ];
    case 'book-quill':
      return [
        poly([[-0.89, -0.63], [-0.12, -0.70], [-0.03, 0.48], [-0.86, 0.71]]),
        poly([[0.05, 0.48], [0.14, -0.70], [0.89, -0.63], [0.86, 0.71]]),
        poly([[0.31, -0.54], [0.48, -0.31], [0.62, 0.91], [0.38, 0.59]]),
      ];
    case 'pencil':
      return [
        poly([[-0.64, -0.75], [-0.41, -0.88], [0.78, 0.36], [0.47, 0.68]]),
        poly([[-0.72, -0.90], [-0.64, -0.75], [-0.41, -0.88]]),
      ];
    default: {
      const exhaustive: never = emblem;
      throw new Error('Unsupported emblem: ' + exhaustive);
    }
  }
}

const standard = (color: THREE.ColorRepresentation, roughness = 0.75) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

function createEmblem(profile: NationalProfile): THREE.Group {
  const crest = new THREE.Group();
  crest.name = 'nation-emblem-' + profile.emblem;

  const R = WB3D_BODY.outerA;
  const radius = R * 0.19;
  const x = WB3D_BODY.outerA * 0.42;
  const y = WB3D_BODY.outerB * 0.48;
  const z = WB3D_BODY.outerC * Math.sqrt(1 - (x / WB3D_BODY.outerA) ** 2 - (y / WB3D_BODY.outerB) ** 2);

  crest.position.set(x, y, z + R * 0.025);
  const normal = new THREE.Vector3(
    x / (WB3D_BODY.outerA ** 2),
    y / (WB3D_BODY.outerB ** 2),
    z / (WB3D_BODY.outerC ** 2),
  ).normalize();
  crest.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

  const back = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, R * 0.032, 36),
    standard('#101827'),
  );
  // Cylinder's axis is +Y by default; orient it so the round face is toward +Z.
  back.rotation.x = Math.PI / 2;
  back.name = 'nation-emblem-solid-base';
  back.castShadow = false;
  back.receiveShadow = true;
  crest.add(back);

  const emblemMaterial = standard('#f5f6f8');
  const symbols = nationalEmblemShapes(profile.emblem);
  for (let i = 0; i < symbols.length; i++) {
    const shape = symbols[i];
    const extruded = new THREE.ExtrudeGeometry(shape, {
      depth: 0.12, bevelEnabled: false, steps: 1, curveSegments: 4,
    });
    const mesh = new THREE.Mesh(extruded, emblemMaterial);
    mesh.scale.set(radius * 0.82, radius * 0.82, radius * 0.18);
    mesh.position.z = R * 0.02;
    mesh.name = 'nation-emblem-piece-' + i;
    mesh.castShadow = false;
    crest.add(mesh);
  }
  return crest;
}

function createFedora(): THREE.Group {
  const hat = new THREE.Group();
  hat.name = 'national-accessory-fedora';
  const R = WB3D_BODY.outerA;
  const dark = standard('#121117', 0.95);
  const band = standard('#333038', 0.95);
  const brim = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.80, R * 0.80, R * 0.06, 48),
    dark,
  );
  brim.name = 'fedora-brim';
  brim.position.y = WB3D_BODY.outerB + R * 0.02;
  brim.castShadow = true;
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.50, R * 0.61, R * 0.36, 48),
    dark,
  );
  crown.name = 'fedora-crown';
  crown.position.y = WB3D_BODY.outerB + R * 0.23;
  crown.castShadow = true;
  const ribbon = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 0.57, R * 0.59, R * 0.065, 48),
    band,
  );
  ribbon.name = 'fedora-band';
  ribbon.position.y = WB3D_BODY.outerB + R * 0.11;
  hat.add(brim, crown, ribbon);
  return hat;
}

export class NationalCharacter3D {
  readonly root = new THREE.Group();
  readonly rig: WhiteBall3DRig;
  readonly emblem: THREE.Group;
  readonly profile: NationalProfile;
  readonly accessory: THREE.Group | null;

  constructor(profile: NationalProfile, lighting?: WhiteBall3DLighting) {
    assertNationalProfile(profile);
    this.profile = profile;
    this.root.name = 'countryball-' + profile.id;
    this.rig = new WhiteBall3DRig({ lighting });

    // The two hands share the same P6 skin material; changing its color
    // updates both hands while leaving the P6 face vertex colors alone.
    this.rig.body.material.color.set(profile.renderColor);
    for (const hand of this.rig.hands) {
      const sphere = hand.children[1] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
      sphere.material.color.set(profile.renderColor);
    }

    this.emblem = createEmblem(profile);
    this.rig.pivot.add(this.emblem);
    this.accessory = profile.accessory === 'fedora' ? createFedora() : null;
    if (this.accessory) this.rig.pivot.add(this.accessory);

    this.root.add(this.rig.root);
    assertGenuine3DCharacter(this.root);
  }

  update(state: WhiteBall3DState): void {
    this.rig.update(state);
  }

  /** The P6 rig remains 1 body, exactly 2 hands and a curved face. */
  topology() {
    return {
      ...this.rig.inventory(),
      nationId: this.profile.id,
      emblem: this.profile.emblem,
      accessory: this.profile.accessory,
      creativeApproval: this.profile.creativeApproval,
    };
  }
}
