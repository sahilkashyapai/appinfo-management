// Mirrors client/src/utils/offices.js — kept in sync manually since the two
// apps don't share code. Used server-side to validate a managedLocation value.
const OFFICE_LOCATIONS = ['Mohali, India', 'Alpharetta, United States', 'Cape Town, South Africa'];

// Maps a branch name to that branch's office location — used to validate a
// branch value and to authoritatively derive the matching location server-side
// (never trust a location the client sends alongside a branch).
const BRANCH_LOCATIONS = {
  India: 'Mohali, India',
  USA: 'Alpharetta, United States',
  'South Africa': 'Cape Town, South Africa',
};

module.exports = { OFFICE_LOCATIONS, BRANCH_LOCATIONS };
