/**
 * P7B national screen profiles. NOT another canon bible.
 * Labels/emblems are sourced from countryballGuide in P7A program.json.
 * Render hex values for named colors are provisional until owner art approval.
 * The genuine P6 topology (mouth and exactly two detached hands) is immutable.
 */
export type NationalEmblem = 'airplane' | 'skyscraper' | 'book-quill' | 'pencil';
export type NationalAccessory = 'none' | 'fedora';
export type NationalProfileId =
  | 'pasgerflitball' | 'reltronlandball' | 'depcutlandball' | 'pencilfaniaball';

export type NationalProfile = Readonly<{
  id: NationalProfileId;
  nation: string;
  canonColorLabel: string;
  renderColor: string;
  renderColorApproval: 'provisional' | 'specified-in-guide';
  emblem: NationalEmblem;
  accessory: NationalAccessory;
  sourceKey: 'countryballGuide';
  topology: 'countryball-3d-p6';
  creativeApproval: 'pending';
}>;

export const NATIONAL_PROFILES: Readonly<Record<NationalProfileId, NationalProfile>> = Object.freeze({
  pasgerflitball: Object.freeze({
    id: 'pasgerflitball', nation: 'Pasgerflit', canonColorLabel: 'Sky Blue',
    renderColor: '#58bce9', renderColorApproval: 'provisional',
    emblem: 'airplane', accessory: 'none',
    sourceKey: 'countryballGuide', topology: 'countryball-3d-p6', creativeApproval: 'pending',
  }),
  reltronlandball: Object.freeze({
    id: 'reltronlandball', nation: 'Reltronland', canonColorLabel: 'Navy Blue',
    renderColor: '#192d59', renderColorApproval: 'provisional',
    emblem: 'skyscraper', accessory: 'none',
    sourceKey: 'countryballGuide', topology: 'countryball-3d-p6', creativeApproval: 'pending',
  }),
  depcutlandball: Object.freeze({
    id: 'depcutlandball', nation: 'Depcutland', canonColorLabel: 'Brown',
    renderColor: '#805d40', renderColorApproval: 'provisional',
    emblem: 'book-quill', accessory: 'fedora',
    sourceKey: 'countryballGuide', topology: 'countryball-3d-p6', creativeApproval: 'pending',
  }),
  pencilfaniaball: Object.freeze({
    id: 'pencilfaniaball', nation: 'Pencilfania', canonColorLabel: '#69D84F',
    renderColor: '#69d84f', renderColorApproval: 'specified-in-guide',
    emblem: 'pencil', accessory: 'none',
    sourceKey: 'countryballGuide', topology: 'countryball-3d-p6', creativeApproval: 'pending',
  }),
});

export const P7B_PROOF_CAST: readonly NationalProfileId[] =
  Object.freeze(['pasgerflitball', 'reltronlandball', 'depcutlandball', 'pencilfaniaball']);

const HEX = /^#[0-9a-fA-F]{6}$/;

export function getNationalProfile(id: string): NationalProfile {
  if (!Object.prototype.hasOwnProperty.call(NATIONAL_PROFILES, id)) {
    throw new Error('P7B unknown/unapproved national-profile ID: ' + id);
  }
  return NATIONAL_PROFILES[id as NationalProfileId];
}

export function assertNationalProfile(profile: NationalProfile): void {
  if (NATIONAL_PROFILES[profile.id] !== profile) throw new Error('P7B profile must be registered, not fabricated at render time');
  if (!HEX.test(profile.renderColor)) throw new Error('P7B invalid render hex');
  if (profile.topology !== 'countryball-3d-p6' || profile.creativeApproval !== 'pending') {
    throw new Error('P7B cannot change P6 rig topology or claim national art approval');
  }
}

export function resolveNationalCast(ids: readonly string[]): readonly NationalProfile[] {
  if (ids.length < 1 || ids.length > 4) throw new Error('P7B proof requires 1–4 registered national profiles');
  const used = new Set<string>();
  return ids.map((id) => {
    if (used.has(id)) throw new Error('P7B duplicate national profile: ' + id);
    used.add(id);
    const p = getNationalProfile(id);
    assertNationalProfile(p);
    return p;
  });
}
