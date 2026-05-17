// Individual metadata modules
export { getLocalTags, type LocalTags } from '../metadata/local-tags';
export { getAcoustidFingerprint, acoustIDLookup, type AcoustIDResult, type ChromaPrintResult } from '../metadata/acoustid';
export { getMusicBrainzData, type Recording, type MusicBrainzRecording, type MusicBrainzRelease } from '../metadata/musicbrainz';
export { fetchGenres } from '../metadata/genre';
