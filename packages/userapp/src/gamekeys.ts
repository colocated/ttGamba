/**
 * The game client's data keys, as the docs describe them.
 *
 * A transcription, not a design. Everything here is copied from the data table
 * at <https://ttycoon.eu/userapps/docs> (readme.md, updated April 16th 2025;
 * read 6 August 2026), and the docs themselves say the list is not complete.
 * Nothing in the app depends on it — it is reference text for the admin panel's
 * game data tab, so that a key sitting there reading `retracting` can say what
 * it is without anyone leaving the window.
 *
 * ── Exact keys and patterns are kept apart on purpose ─────────────────────
 * `KEYS` is names. `PATTERNS` is families — `runway_[id]`, `exp_[group]_[skill]`,
 * every identifier the client happens to have. Only the first can be listed as
 * "documented but not seen", because a family has no members until one turns
 * up: there is no such thing as the runway key that is missing.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type KeyDoc = {
  /** The docs' own word for the type. Not enforced anywhere — values arrive as they arrive. */
  type: string;
  blurb: string;
};

/**
 * Every key the docs name outright.
 *
 * Grouped as the docs group them, which is roughly by subject, because that is
 * the order in which anyone reading down the table is looking for something.
 */
const KEYS: Record<string, KeyDoc> = {
  // Who they are
  user_id: { type: "number", blurb: "The user ID of the player. The key ttGamba stores chips against." },
  source: { type: "number", blurb: "The player index — which slot on the server they are sitting in." },
  name: { type: "string", blurb: "The player's name." },
  discord: { type: "string", blurb: "Discord identifier, in raw form: discord:<id>." },
  pkey: { type: "string", blurb: "The player's public API key, if one has been generated." },

  // Work
  job: { type: "string", blurb: "The current job the player has." },
  job_name: { type: "string", blurb: "Display name of the current job." },
  job_title: { type: "string", blurb: "Full display title of the current job, with subjob suffix." },
  subjob: { type: "string", blurb: "The current subjob (a job within a job)." },
  subjob_name: { type: "string", blurb: "Display name of the current subjob." },

  // Money
  wallet: { type: "number", blurb: "Current wallet balance, in dollars. Not chips." },
  bank: { type: "number", blurb: "Current bank balance, in dollars. Not chips." },

  // Faction
  faction_id: { type: "number", blurb: "Faction ID." },
  faction_name: { type: "string", blurb: "Name of the current faction." },
  faction_tag: { type: "string", blurb: "Faction chat tag." },
  faction_president: { type: "boolean", blurb: "Is the player the president of the faction?" },

  // Condition
  health: { type: "number", blurb: "The player's current health." },
  armor: { type: "number", blurb: "The player's current armor." },
  weapon: { type: "string", blurb: "Internal name of the currently held weapon, or a raw hash if it is not in the lookup." },

  // The vehicle they are in
  vehicle: { type: "string", blurb: "Model name of the occupied vehicle. `onFoot` when on foot." },
  vehicleClass: { type: "number", blurb: "Class ID for the vehicle." },
  vehicleName: { type: "string", blurb: "Display name for the vehicle." },
  vehicleMake: { type: "string", blurb: "Vehicle brand name." },
  vehicleClassName: { type: "string", blurb: "Class name for the vehicle. Not always based on vehicleClass." },
  rpm: { type: "number", blurb: "Vehicle engine RPM." },
  engine: { type: "string", blurb: "Vehicle engine state: `on` or `off`." },
  fuel: { type: "number", blurb: "Remaining fuel in the vehicle." },
  honk: { type: "boolean", blurb: "Is the horn being sounded?" },
  altitude: { type: "number", blurb: "Vehicle altitude over terrain." },
  landing_gear: {
    type: "string",
    blurb: "Landing gear state: deployed, retracting, deploying, retracted or broken.",
  },

  // The vehicles they own
  car: { type: "string", blurb: "Model name of their spawned car." },
  cab: { type: "string", blurb: "Model name of their spawned cab." },
  trailer: { type: "string", blurb: "Model name of their spawned trailer." },
  aircraft: { type: "string", blurb: "Model name of their spawned aircraft." },
  helicopter: { type: "string", blurb: "Model name of their spawned helicopter." },
  boat: { type: "string", blurb: "Model name of their spawned boat." },

  // Where they are
  pos_x: { type: "number", blurb: "Player position, X component." },
  pos_y: { type: "number", blurb: "Player position, Y component." },
  pos_z: { type: "number", blurb: "Player position, Z component." },
  pos_h: { type: "number", blurb: "Player rotation (heading)." },
  zone: { type: "string", blurb: "Map area ID." },
  zoneName: { type: "string", blurb: "Name of the map area." },
  street: { type: "string", blurb: "Current street name." },

  // Where the camera is
  cam_heading: { type: "number", blurb: "Camera Z rotation (yaw)." },
  cam_pitch: { type: "number", blurb: "Camera X rotation." },
  cam_roll: { type: "number", blurb: "Camera Y rotation." },
  cam_x: { type: "number", blurb: "Camera position, X component." },
  cam_y: { type: "number", blurb: "Camera position, Y component." },
  cam_z: { type: "number", blurb: "Camera position, Z component." },

  // The waypoint
  waypoint: { type: "boolean", blurb: "Is a waypoint set?" },
  waypoint_x: { type: "number", blurb: "Waypoint position, X component." },
  waypoint_y: { type: "number", blurb: "Waypoint position, Y component." },

  // What they are carrying
  inventory: { type: "string", blurb: "JSON of the current player inventory." },
  weight: { type: "number", blurb: "Current weight of the inventory." },
  max_weight: { type: "number", blurb: "Capacity of the inventory." },
  chest: { type: "string", blurb: "Internal ID of the open chest — storage, trunk and so on." },

  // The vRP interface
  menu: { type: "string", blurb: "Title of the open vRP menu." },
  menu_open: { type: "boolean", blurb: "Is the menu on screen?" },
  menu_choice: { type: "string", blurb: "The last vRP menu button choice." },
  prompt: { type: "boolean", blurb: "Is an input prompt on screen?" },
  prompt_title: { type: "string", blurb: "The text shown on the input prompt." },
  prompt_number_only: { type: "boolean", blurb: "Is the prompt for a number value?" },
  request: { type: "boolean", blurb: "Is a request active? The docs mark this unused." },
  notification: { type: "string", blurb: "The last notification shown." },

  // This app, as the client sees it
  hidden: { type: "boolean", blurb: "Is the web app hidden (closed)?" },
  pinned: { type: "boolean", blurb: "Is the web app pinned — on screen, but not in focus?" },
  focused: { type: "boolean", blurb: "Is the web app in focus?" },
  tabbed: { type: "boolean", blurb: "Is this web app the current tab?" },

  // The world
  players: {
    type: "string",
    blurb: "JSON of online players, keyed by server id. Each carries at least a name.",
  },
  weather: { type: "string", blurb: "Current weather type, or the one being transitioned to." },
  weather_forecast: { type: "string", blurb: "The next expected weather type." },
  weather_frozen: { type: "boolean", blurb: "Is the weather frozen — not going to change?" },
  weather_snow: { type: "boolean", blurb: "Is there snow on the ground?" },
  radio: { type: "string", blurb: 'Label name of the current radio station. "OFF" when off.' },
  radioName: { type: "string", blurb: "In-game name of the current radio station." },
  radioSong: { type: "string", blurb: 'The playing song, as "Artist - Title".' },

  /*
    PIGS, the heist system. Under development per the docs and liable to vary,
    so anything read out of these is worth checking against the game rather
    than against this table.
  */
  PartyTier: { type: "number", blurb: "PIGS: current party tier, 1–7." },
  pigs_client_state_inParty: { type: "boolean", blurb: "PIGS: is the player in a party?" },
  pigs_client_state_tier: { type: "number", blurb: "PIGS: current party tier, 1–7." },
  pigs_client_state_streak: { type: "number", blurb: "PIGS: current heist_escaped streak for the tier." },
  pigs_client_state_state: {
    type: "string",
    blurb:
      "PIGS: party state — idle, forming, preparing, ready_check, heist_setup, heist_active or heist_complete.",
  },
  pigs_client_state_selectedLocation: { type: "string", blurb: "PIGS: location of the current heist." },
  pigs_client_state_locationCoords: {
    type: "object",
    blurb: "PIGS: heist location as {x, y, z}.",
  },
  pigs_client_state_id: { type: "number", blurb: "PIGS: user_id of the party host." },
  pigs_client_state_created: {
    type: "number",
    blurb: "PIGS: party creation time in seconds, on the in-game clock.",
  },
  pigs_client_state_lastSync: {
    type: "number",
    blurb: "PIGS: last sync time in seconds, on the in-game clock.",
  },
  pigs_client_state_memberCount: { type: "number", blurb: "PIGS: number of players in the party." },
  pigs_client_state_leaderUserId: { type: "number", blurb: "PIGS: user_id of the party host." },
  pigs_client_state_leaderSource: { type: "number", blurb: "PIGS: player index of the party host." },
  pigs_client_state_myUserId: { type: "number", blurb: "PIGS: the user ID of this player." },
  pigs_client_state_isLeader: { type: "boolean", blurb: "PIGS: is the player the party leader?" },
  pigs_client_state_isReady: {
    type: "boolean",
    blurb: "PIGS: has the player readied up at the heist location?",
  },
};

/**
 * Families of key, matched in order.
 *
 * The PIGS member rules come first: they are `pigs_client_state_...` too, and a
 * generic rule placed above them would answer for all of them.
 */
const PATTERNS: readonly { match: RegExp; type: string; blurb: string }[] = [
  {
    match: /^pigs_client_state_members_(.+)_tier$/,
    type: "number",
    blurb: "PIGS: max tier for that party member.",
  },
  {
    match: /^pigs_client_state_members_(.+)_source$/,
    type: "number",
    blurb: "PIGS: player index of that party member.",
  },
  {
    match: /^pigs_client_state_members_(.+)_userId$/,
    type: "number",
    blurb: "PIGS: user ID of that party member.",
  },
  {
    match: /^pigs_client_state_members_(.+)_name$/,
    type: "string",
    blurb: "PIGS: name of that party member.",
  },
  {
    match: /^pigs_client_state_members_(.+)_ready$/,
    type: "boolean",
    blurb: "PIGS: has that member readied up at the heist location?",
  },
  {
    match: /^runway_/,
    type: "string",
    blurb:
      "Runway state: free (yellow), occupied (red) or reserved (green) — reserved meaning this player called ATC for it. Named [airport]_[designation], e.g. LSIA_MAIN.",
  },
  {
    match: /^exp_/,
    type: "number",
    blurb:
      "Experience in one skill, as exp_[group]_[skill]. level = (√(1 + 8·xp/5) − 1) / 2.",
  },
  {
    match: /^chest_/,
    type: "string",
    blurb:
      "JSON of the inventory in that chest. Only updates while the chest is open, and is never cached — getData will not return it.",
  },
  {
    match: /^players_/,
    type: "string",
    blurb:
      "Server-shared data from web apps: {serverId: [value, serverTime]}. Entries expire after 2 minutes.",
  },
  {
    match: /^local_/,
    type: "string",
    blurb: "Data shared between the web apps loaded on this client, via shareLocalData.",
  },
  {
    match: /^trigger_/,
    type: "number",
    blurb:
      "A keybind firing. The value is the client timer in milliseconds. Never cached — square, triangle, circle and cross are built in.",
  },
  { match: /^temp_/, type: "any", blurb: "A transient value. Never cached." },
  {
    match: /^(steam|license\d*|xbl|live|fivem|ip)$/,
    type: "string",
    blurb: "A player identifier, keyed by its type and carrying the raw prefixed value.",
  },
];

/** Every key the docs name outright, alphabetically. Families are not in here — see above. */
export const DOCUMENTED_KEYS: readonly string[] = Object.keys(KEYS).sort((a, b) =>
  a.localeCompare(b),
);

/**
 * What a key is, or `null` if the docs do not mention it.
 *
 * `null` is worth showing rather than hiding. The docs describe their own list
 * as incomplete, so an unrecognised key is usually the client volunteering
 * something nobody wrote down — which is exactly the kind of thing the game
 * data tab is for finding.
 */
export function describeKey(key: string): KeyDoc | null {
  const exact = KEYS[key];
  if (exact) return exact;

  for (const pattern of PATTERNS) {
    if (pattern.match.test(key)) return { type: pattern.type, blurb: pattern.blurb };
  }

  return null;
}
