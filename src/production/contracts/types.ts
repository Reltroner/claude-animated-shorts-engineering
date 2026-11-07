/** P7A: Story metadata only. Never a renderer, an automatic canon ratification or a release API. */
export const P7A_SCHEMA_VERSION = 'reltroner.p7a/1' as const;

export type StoryStatus =
  | 'concept'
  | 'development-material'
  | 'planned-forward-architecture'
  | 'structured-canon'
  | 'production-candidate'
  | 'published-canon'
  | 'superseded-archived-draft';

export type NarrativeMode = 'current-lore' | 'backstory' | 'wiki';
export type SourceAuthority = 'master' | 'franchise' | 'character' | 'production';

/** Each source is pinned once, at program scope. Seasons/episodes reference keys, not copied hashes. */
export interface SourcePin {
  readonly repository: string;
  readonly path: string;
  readonly revision: string;
  readonly authority: SourceAuthority;
}

export interface FormatProfile {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
}

export interface ProgramManifest {
  readonly schemaVersion: typeof P7A_SCHEMA_VERSION;
  readonly kind: 'program';
  readonly programId: string;
  readonly seriesCode: string;
  readonly title: string;
  readonly universeId: string;
  /** Reference only; P7B implements the real national-character adapter. */
  readonly characterPerformanceProfileId: string;
  readonly defaultFormat: FormatProfile;
  readonly sourceRegistry: Readonly<Record<string, SourcePin>>;
  readonly seasonIds: readonly string[];
}

export interface SeasonManifest {
  readonly schemaVersion: typeof P7A_SCHEMA_VERSION;
  readonly kind: 'season';
  readonly programId: string;
  readonly seasonId: string;
  readonly seasonNumber: number;
  readonly workingTitle: string;
  readonly storyStatus: StoryStatus;
  readonly sourceKeys: readonly string[];
  readonly openingEpisodeId: string;
  readonly episodeIds: readonly string[];
}

export interface EpisodeApproval {
  readonly technical: 'pending' | 'pass' | 'fail';
  readonly creative: 'pending' | 'approved' | 'revise';
  readonly canonFreeze: boolean;
  readonly publication: 'blocked' | 'approved';
}

export interface EpisodeManifest {
  readonly schemaVersion: typeof P7A_SCHEMA_VERSION;
  readonly kind: 'episode';
  readonly programId: string;
  readonly seasonId: string;
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly workingTitle: string;
  readonly storyStatus: StoryStatus;
  readonly sourceKeys: readonly string[];
  readonly castIds: readonly string[];
  readonly narrativeModes: readonly NarrativeMode[];
  /** IDs only. Scene manifests and frame timing are a later phase, not invented by P7A. */
  readonly sceneIds: readonly string[];
  readonly approval: EpisodeApproval;
}

export interface P7AHierarchy {
  readonly program: ProgramManifest;
  readonly season: SeasonManifest;
  readonly episodes: readonly EpisodeManifest[];
}
