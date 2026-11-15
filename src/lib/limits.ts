/**
 * Input limits shared by the forms (maxLength, hints) and the server
 * (validation). The database checks the same bounds (see schema.ts).
 */
export const IDEA_TITLE_MIN = 3;
export const IDEA_TITLE_MAX = 120;
export const IDEA_DESCRIPTION_MAX = 500;
export const NAME_MIN = 2;
export const NAME_MAX = 32;
export const COMMENT_MAX = 1000;
export const SEARCH_MAX = 80;
/** Avatar upload, before re-encoding. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "5 Mo";
