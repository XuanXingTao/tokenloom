import { encode } from 'gpt-tokenizer/encoding/o200k_base';

// Treat special-token-looking user data as ordinary text, never as control tokens.
export const countTokens = (text) => encode(text, { disallowedSpecial: new Set() }).length;
export const encoding = 'o200k_base';
