import { blockCenter } from "../city/cityLayout";

export type StepType =
  | "TRAVEL"
  | "CLEAR_BUILDING"
  | "PLANT_BOMB"
  | "DETONATE"
  | "RETRIEVE"
  | "ELIMINATE"
  | "DEFEND"
  | "DESTROY_CONVOY"
  | "RETURN_SAFEHOUSE";

export interface MissionStep {
  type: StepType;
  /** Short HUD instruction. */
  text: string;
  buildingId?: string;
  /** Target floor for PLANT_BOMB / RETRIEVE / ELIMINATE (0 = ground). */
  floor?: number;
  /** Guards posted on the target floor; must all be down before planting / retrieving. */
  guards?: number;
  /** Hostiles per floor for CLEAR_BUILDING. */
  enemiesPerFloor?: number;
  /** Seconds the player must hold [E] (plant, retrieve). */
  holdSec?: number;
  /** DEFEND: seconds to hold the zone. */
  durationSec?: number;
  zone?: { x: number; z: number; radius: number };
  /** DETONATE: metres the player must be from the charge. */
  safeDistance?: number;
  /** ELIMINATE: target name and health. */
  targetName?: string;
  targetHp?: number;
  /** Radio line shown when the step begins. */
  radio?: string;
}

export interface Mission {
  id: string;
  act: 1 | 2 | 3;
  number: number;
  title: string;
  location: string;
  briefing: string[];
  steps: MissionStep[];
  reward: { scrap: number; plates: number; chips: number };
  outro: string;
}

export const ACT_TITLES: Record<1 | 2 | 3, { title: string; subtitle: string }> = {
  1: { title: "Act I — Foothold", subtitle: "Take back a corner of the city." },
  2: { title: "Act II — The Ledger", subtitle: "Follow the money through Varos-Meridian." },
  3: { title: "Act III — Reckoning", subtitle: "Break the Consortium at its root." },
};

export const CAMPAIGN_PROLOGUE: string[] = [
  "Varos-Meridian, winter 2031. For a century the free city on the border banked for both East and West, and both left it alone.",
  "Then the ceasefire collapsed. Within a week the Ashgrove Consortium — a private army with a bank attached — locked the city down, and nobody on either side could explain who invited them.",
  "Your command knows. The Consortium has been financing both armies through the Meridian Reserve Bank, keeping the war alive and collecting interest on every shell fired. Its books are called the Ledger.",
  "You are Meridian Six. Your squad came in through the southwest rail yards with one APC, a resistance contact named Tomas Hale, and orders to take the city back one building at a time.",
];

const PLAZA = { x: blockCenter(3), z: blockCenter(2) };

export const MISSIONS: ReadonlyArray<Mission> = [
  {
    id: "m01",
    act: 1,
    number: 1,
    title: "Cold Arrival",
    location: "Kestrel Row Apartments",
    briefing: [
      'Hale: "The apartment block on Kestrel Row is the only place in the southwest with a working roof. Consortium scavengers moved in last week."',
      "Clear every floor. Once it is ours, it is home — you can rest and resupply there.",
    ],
    steps: [
      {
        type: "TRAVEL",
        text: "Reach Kestrel Row Apartments",
        buildingId: "safehouse",
        radio: 'Hale: "Front door faces the avenue. Stack up and go in quiet."',
      },
      {
        type: "CLEAR_BUILDING",
        text: "Clear every floor of Kestrel Row",
        buildingId: "safehouse",
        enemiesPerFloor: 2,
        radio: 'Hale: "Use the stairwell by the west wall. Check every room."',
      },
    ],
    reward: { scrap: 40, plates: 1, chips: 0 },
    outro:
      "Kestrel Row is secure. Hale hangs a blanket over the windows and calls it headquarters.",
  },
  {
    id: "m02",
    act: 1,
    number: 2,
    title: "Thin Blue Line",
    location: "9th Precinct Station",
    briefing: [
      "The Consortium turned the 9th Precinct into a holding pen. Anyone who asked questions about the bank ended up in its cells.",
      "Take the station and recover the detainee roster from the top-floor records room. Those names are our future allies.",
    ],
    steps: [
      { type: "TRAVEL", text: "Reach the 9th Precinct", buildingId: "precinct" },
      {
        type: "CLEAR_BUILDING",
        text: "Clear every floor of the precinct",
        buildingId: "precinct",
        enemiesPerFloor: 3,
      },
      {
        type: "RETRIEVE",
        text: "Download the detainee roster (hold E)",
        buildingId: "precinct",
        floor: 2,
        holdSec: 8,
        radio:
          'Hale: "The terminal is upstairs. It will take a few seconds — keep your head down."',
      },
    ],
    reward: { scrap: 55, plates: 1, chips: 1 },
    outro:
      "The roster lists two hundred names. Forty of them are bank clerks. Somebody in the Reserve Bank was trying to talk.",
  },
  {
    id: "m03",
    act: 1,
    number: 3,
    title: "Dead Letters",
    location: "Central Post & Telegraph",
    briefing: [
      "One of the clerks, codename Wren, left messages in a dead-letter box at the Central Post before vanishing.",
      "The Consortium is sorting the mail looking for exactly that. Get there first.",
    ],
    steps: [
      { type: "TRAVEL", text: "Reach the Central Post", buildingId: "post" },
      {
        type: "CLEAR_BUILDING",
        text: "Clear the post office",
        buildingId: "post",
        enemiesPerFloor: 3,
      },
      {
        type: "RETRIEVE",
        text: "Recover Wren's letters from the sorting room (hold E)",
        buildingId: "post",
        floor: 1,
        holdSec: 8,
      },
      {
        type: "RETURN_SAFEHOUSE",
        text: "Bring the letters back to Kestrel Row",
        radio: 'Hale: "Do not open them on the street. Bring them home."',
      },
    ],
    reward: { scrap: 60, plates: 1, chips: 1 },
    outro:
      'Wren writes: "They own the radio, the power and the police. The money moves through the vault under the Reserve Bank. Burn the voice first."',
  },
  {
    id: "m04",
    act: 1,
    number: 4,
    title: "Static",
    location: "Meridian Broadcast House",
    briefing: [
      "Every hour Broadcast House tells the city the Consortium is keeping it safe. As long as it transmits, nobody will stand up.",
      "Fight to the transmitter room on the top floor, plant a charge, then get clear and bring the building down.",
    ],
    steps: [
      { type: "TRAVEL", text: "Reach Meridian Broadcast House", buildingId: "broadcast" },
      {
        type: "CLEAR_BUILDING",
        text: "Clear all five floors of Broadcast House",
        buildingId: "broadcast",
        enemiesPerFloor: 3,
      },
      {
        type: "PLANT_BOMB",
        text: "Plant the charge in the top-floor transmitter room (hold E)",
        buildingId: "broadcast",
        floor: 4,
        guards: 2,
        holdSec: 10,
        radio: 'Hale: "Plant it against the transmitter racks. Then run."',
      },
      {
        type: "DETONATE",
        text: "Get 50 m clear and press G to detonate",
        buildingId: "broadcast",
        safeDistance: 50,
      },
    ],
    reward: { scrap: 75, plates: 2, chips: 1 },
    outro:
      "Broadcast House folds into the street. For the first time in a month, the radios of Varos-Meridian go quiet.",
  },
  {
    id: "m05",
    act: 1,
    number: 5,
    title: "Iron Road",
    location: "Grand Avenue",
    briefing: [
      "With the voice gone the Consortium is moving cash and weapons out by armored convoy along Grand Avenue.",
      "Hit the convoy, take what it carries, and get back to Kestrel Row.",
    ],
    steps: [
      {
        type: "DESTROY_CONVOY",
        text: "Destroy the armored convoy on Grand Avenue",
        radio: 'Hale: "Three vehicles. Kill the cargo truck and the escorts scatter."',
      },
      { type: "RETURN_SAFEHOUSE", text: "Return to Kestrel Row" },
    ],
    reward: { scrap: 90, plates: 2, chips: 1 },
    outro:
      "In the convoy's cargo: medical supplies stamped with St. Aurel Hospital's seal, and wounded resistance fighters' names on the manifests.",
  },
  {
    id: "m06",
    act: 2,
    number: 6,
    title: "Triage",
    location: "St. Aurel General Hospital",
    briefing: [
      "St. Aurel is where the Consortium keeps the wounded it wants to question — and the medicine the rest of the city needs.",
      "Clear all five floors and recover the medical cache from the third-floor pharmacy.",
    ],
    steps: [
      { type: "TRAVEL", text: "Reach St. Aurel General Hospital", buildingId: "hospital" },
      {
        type: "CLEAR_BUILDING",
        text: "Clear every ward of St. Aurel",
        buildingId: "hospital",
        enemiesPerFloor: 3,
      },
      {
        type: "RETRIEVE",
        text: "Secure the pharmacy cache (hold E)",
        buildingId: "hospital",
        floor: 3,
        holdSec: 10,
      },
    ],
    reward: { scrap: 100, plates: 2, chips: 2 },
    outro:
      'Among the patients is Wren, alive. She has one more thing to say: "The paymaster lives in the Imperial. Find Konrad Bell."',
  },
  {
    id: "m07",
    act: 2,
    number: 7,
    title: "Paper Trail",
    location: "Municipal Records Hall",
    briefing: [
      "Before we touch Bell, we need proof. The Records Hall holds the property transfers that handed half the city to Ashgrove shell companies.",
      "The deeds are on the second floor. The Consortium will burn them if they see you coming.",
    ],
    steps: [
      { type: "TRAVEL", text: "Reach the Municipal Records Hall", buildingId: "records" },
      {
        type: "CLEAR_BUILDING",
        text: "Clear the Records Hall",
        buildingId: "records",
        enemiesPerFloor: 4,
      },
      {
        type: "RETRIEVE",
        text: "Photograph the property deeds (hold E)",
        buildingId: "records",
        floor: 2,
        holdSec: 12,
      },
    ],
    reward: { scrap: 100, plates: 2, chips: 2 },
    outro: "Every deed carries the same signature: K. Bell, on behalf of Ashgrove Holdings.",
  },
  {
    id: "m08",
    act: 2,
    number: 8,
    title: "Room Service",
    location: "Hotel Imperial",
    briefing: [
      "Konrad Bell pays every Consortium soldier in the city. He lives in the penthouse of the Hotel Imperial and never leaves.",
      "Seven floors of security stand between you and him. Clear them all, then deal with Bell.",
    ],
    steps: [
      { type: "TRAVEL", text: "Reach the Hotel Imperial", buildingId: "hotel" },
      {
        type: "CLEAR_BUILDING",
        text: "Clear all seven floors of the Imperial",
        buildingId: "hotel",
        enemiesPerFloor: 3,
      },
      {
        type: "ELIMINATE",
        text: "Eliminate paymaster Konrad Bell in the penthouse",
        buildingId: "hotel",
        floor: 6,
        guards: 3,
        targetName: "Konrad Bell",
        targetHp: 420,
        radio: 'Hale: "His bodyguards just came up the service stairs. Bell is in the penthouse."',
      },
    ],
    reward: { scrap: 120, plates: 3, chips: 2 },
    outro:
      "Bell's notebook names the next step: the Consortium's defenses run on power from the East Substation.",
  },
  {
    id: "m09",
    act: 2,
    number: 9,
    title: "Lights Out",
    location: "Varos East Power Substation",
    briefing: [
      "The substation feeds the bank vault locks, the tower and every Consortium checkpoint.",
      "Clear it, plant a charge on the main transformer hall and black out their half of the city.",
    ],
    steps: [
      { type: "TRAVEL", text: "Reach the East Power Substation", buildingId: "substation" },
      {
        type: "CLEAR_BUILDING",
        text: "Clear the substation",
        buildingId: "substation",
        enemiesPerFloor: 4,
      },
      {
        type: "PLANT_BOMB",
        text: "Plant the charge on the transformer hall (hold E)",
        buildingId: "substation",
        floor: 0,
        guards: 3,
        holdSec: 10,
      },
      {
        type: "DETONATE",
        text: "Get 50 m clear and press G to detonate",
        buildingId: "substation",
        safeDistance: 50,
      },
    ],
    reward: { scrap: 120, plates: 3, chips: 2 },
    outro:
      "The eastern skyline goes dark. Only Ashgrove Tower still glows — it has its own generators.",
  },
  {
    id: "m10",
    act: 2,
    number: 10,
    title: "Undercroft",
    location: "Ostrava Parking Structure",
    briefing: [
      "In the dark, the Consortium pulled its armor into the Ostrava parking structure. The vault access codes travel with the armor commander.",
      "Clear all four levels and take the codes from the commander’s post on the top deck.",
    ],
    steps: [
      { type: "TRAVEL", text: "Reach the Ostrava Parking Structure", buildingId: "garage" },
      {
        type: "CLEAR_BUILDING",
        text: "Clear all four levels",
        buildingId: "garage",
        enemiesPerFloor: 4,
      },
      {
        type: "RETRIEVE",
        text: "Crack the vault access codes (hold E)",
        buildingId: "garage",
        floor: 3,
        guards: 2,
        holdSec: 12,
      },
      { type: "RETURN_SAFEHOUSE", text: "Bring the codes to Kestrel Row" },
    ],
    reward: { scrap: 140, plates: 3, chips: 3 },
    outro:
      'Hale reads the codes twice. "This opens the vault. And the vault is where the Ledger lives."',
  },
  {
    id: "m11",
    act: 3,
    number: 11,
    title: "Judgment",
    location: "Varos Hall of Justice",
    briefing: [
      "The Consortium answered the blackout with a tribunal. Resistance prisoners are being sentenced at the Hall of Justice tonight.",
      "Clear the courthouse and free the prisoners held on the top floor.",
    ],
    steps: [
      { type: "TRAVEL", text: "Reach the Hall of Justice", buildingId: "courthouse" },
      {
        type: "CLEAR_BUILDING",
        text: "Clear all four floors of the courthouse",
        buildingId: "courthouse",
        enemiesPerFloor: 4,
      },
      {
        type: "RETRIEVE",
        text: "Cut the prisoners loose (hold E)",
        buildingId: "courthouse",
        floor: 3,
        guards: 3,
        holdSec: 12,
      },
    ],
    reward: { scrap: 140, plates: 3, chips: 3 },
    outro:
      'Thirty freed prisoners join the resistance. One of them is a vault engineer. "I can tell you exactly where to put the charge."',
  },
  {
    id: "m12",
    act: 3,
    number: 12,
    title: "The Vault",
    location: "Meridian Reserve Bank",
    briefing: [
      "This is the heart of it. The Ledger sits in the bank’s records office on the top floor; the gold and bonds that pay for the war sit in the vault on the ground floor.",
      "Take the Ledger. Then plant the charge in the vault, get clear and bomb the bank.",
    ],
    steps: [
      { type: "TRAVEL", text: "Reach the Meridian Reserve Bank", buildingId: "bank" },
      {
        type: "RETRIEVE",
        text: "Steal the Ledger from the top-floor records office (hold E)",
        buildingId: "bank",
        floor: 2,
        guards: 5,
        holdSec: 12,
        radio:
          'Hale: "Guards on every landing. The Ledger first — nothing else matters if we lose it."',
      },
      {
        type: "PLANT_BOMB",
        text: "Plant the charge inside the ground-floor vault (hold E)",
        buildingId: "bank",
        floor: 0,
        guards: 6,
        holdSec: 14,
        radio: 'Engineer: "Against the east vault wall. Do not rush it."',
      },
      {
        type: "DETONATE",
        text: "Get 60 m clear and press G to bomb the bank",
        buildingId: "bank",
        safeDistance: 60,
      },
    ],
    reward: { scrap: 180, plates: 4, chips: 3 },
    outro:
      "The Reserve Bank comes down in a column of dust and burning paper. Somewhere in Ashgrove Tower, someone is very angry.",
  },
  {
    id: "m13",
    act: 3,
    number: 13,
    title: "Liberty Plaza",
    location: "Liberty Plaza",
    briefing: [
      "The Consortium is throwing everything it has left at Liberty Plaza to retake the city center.",
      "Hold the plaza until the counterattack breaks.",
    ],
    steps: [
      { type: "TRAVEL", text: "Reach Liberty Plaza", zone: { ...PLAZA, radius: 16 } },
      {
        type: "DEFEND",
        text: "Hold Liberty Plaza",
        zone: { ...PLAZA, radius: 18 },
        durationSec: 150,
        radio: 'Hale: "Here they come. Stay inside the plaza — if you leave, the clock stops."',
      },
    ],
    reward: { scrap: 160, plates: 4, chips: 3 },
    outro:
      "The counterattack breaks. Consortium survivors fall back to the only place left: Ashgrove Tower.",
  },
  {
    id: "m14",
    act: 3,
    number: 14,
    title: "Ascent",
    location: "Ashgrove Consortium Tower",
    briefing: [
      "Nine floors. Every one of them held by the Consortium’s best.",
      "Clear the tower floor by floor. There is no shortcut and no second way up.",
    ],
    steps: [
      { type: "TRAVEL", text: "Reach Ashgrove Tower", buildingId: "tower" },
      {
        type: "CLEAR_BUILDING",
        text: "Clear all nine floors of Ashgrove Tower",
        buildingId: "tower",
        enemiesPerFloor: 4,
      },
    ],
    reward: { scrap: 200, plates: 4, chips: 4 },
    outro:
      "The tower is quiet. Then the elevator motors start — someone is coming up from the private garage.",
  },
  {
    id: "m15",
    act: 3,
    number: 15,
    title: "The Director",
    location: "Ashgrove Consortium Tower",
    briefing: [
      "Director Ilse Varga came back for the servers on the top floor: the digital copy of the Ledger.",
      "Stop her, then wipe the servers so nobody can rebuild the Consortium from them.",
    ],
    steps: [
      {
        type: "ELIMINATE",
        text: "Eliminate Director Ilse Varga on the top floor",
        buildingId: "tower",
        floor: 8,
        guards: 6,
        targetName: "Director Ilse Varga",
        targetHp: 900,
      },
      {
        type: "RETRIEVE",
        text: "Wipe the Ledger servers (hold E)",
        buildingId: "tower",
        floor: 8,
        holdSec: 15,
      },
    ],
    reward: { scrap: 220, plates: 5, chips: 4 },
    outro:
      "The servers die one rack at a time. Varga’s last order already went out: her lieutenants are running for the border with what is left.",
  },
  {
    id: "m16",
    act: 3,
    number: 16,
    title: "Meridian Dawn",
    location: "Grand Avenue",
    briefing: [
      "The last Consortium convoy is on Grand Avenue, carrying the gold that survived the bank.",
      "Stop it, then come home.",
    ],
    steps: [
      { type: "DESTROY_CONVOY", text: "Destroy the escape convoy on Grand Avenue" },
      { type: "RETURN_SAFEHOUSE", text: "Return to Kestrel Row" },
    ],
    reward: { scrap: 250, plates: 5, chips: 5 },
    outro:
      "Dawn over Varos-Meridian. The Ledger is ash, the Consortium is gone, and for the first time in years both East and West have to explain their war without someone else paying for it.",
  },
];

/** Lore dossiers found in loot crates around the city. */
export const LORE_DOSSIERS: ReadonlyArray<{ id: string; title: string; text: string }> = [
  {
    id: "d01",
    title: "Charter of the Free City (1931)",
    text: "Varos-Meridian shall bank for all and side with none. Its neutrality is its only army.",
  },
  {
    id: "d02",
    title: "Ashgrove recruitment flyer",
    text: "Security for a changing world. Competitive pay. No flags, no politics, no questions.",
  },
  {
    id: "d03",
    title: "Clerk’s diary, page 12",
    text: "Two transfers today: one to the Eastern Pact armory, one to the Western Coalition. Same amount. Same sender.",
  },
  {
    id: "d04",
    title: "Checkpoint order 44-B",
    text: "Residents of the southwest are to be turned back. Anyone carrying paper documents is to be detained.",
  },
  {
    id: "d05",
    title: "Letter to a mother",
    text: "They pay us in the bank’s own notes, Mama. You can only spend them in the city. Nobody leaves.",
  },
  {
    id: "d06",
    title: "Hotel Imperial guest list",
    text: "Penthouse: K. Bell (permanent). Floor 5: “Director” — no name, no checkout date.",
  },
  {
    id: "d07",
    title: "Substation maintenance log",
    text: "Tower generators isolated from the grid on Director’s order. Vault locks remain on mains.",
  },
  {
    id: "d08",
    title: "Tram driver’s note",
    text: "Route 7 suspended. They took the depot for armor. The old men in Liberty Plaza still feed the pigeons.",
  },
  {
    id: "d09",
    title: "Varga interview, 2027",
    text: "War is a market like any other. I simply refuse to pick a side before the invoice is paid.",
  },
  {
    id: "d10",
    title: "Resistance pamphlet",
    text: "They own the bank. We own the streets. Every building we take back is a vote.",
  },
  {
    id: "d11",
    title: "Vault engineer’s sketch",
    text: "East wall of the vault is the weak point — the original 1931 brickwork behind the steel.",
  },
  {
    id: "d12",
    title: "Hale’s field notebook",
    text: "Meridian Six moves like they’ve done this before. Let’s hope they have.",
  },
  {
    id: "d13",
    title: "Wiretap Transcript: The Double Siphon (Oct 14)",
    text: "Consortium Operator: 'Western depot received forty pallets of AP rounds this morning. Ship forty pallets to the Eastern rail yard tonight. Keep the casualty rates symmetrical until the bonds mature.'",
  },
  {
    id: "d14",
    title: "Black Iron Armory Manifest #88",
    text: "Ordnance inspection records reveal identical tungsten-carbide penetrators shipped in crates marked with forged coalition inspection stamps. Both sides were buying weapons forged in the same foundry.",
  },
  {
    id: "d15",
    title: "Civilian Radio Intercept: Kestrel FM",
    text: "Emergency pirate broadcast: 'To anyone hiding in Sector 4: do not take Grand Avenue. The armored convoys fire on anything moving. Safehouses on Kestrel Row still have bread and fresh filters.'",
  },
  {
    id: "d16",
    title: "Director Varga’s Personal Comm: On Asymmetric Leverage",
    text: "Varga: 'Victory is unprofitable. A decisive triumph ends the consumption of capital. Balance of attrition is the only sustainable business model in modern warfare.'",
  },
  {
    id: "d17",
    title: "Ashgrove Security Memo: Checkpoint Gamma",
    text: "Strict order from Security Chief Bell: 'All civilian couriers carrying physical paper ledgers are to be shot on sight. No verbal warnings. The accounts must not leave the Tower vault.'",
  },
  {
    id: "d18",
    title: "The Meridian Transit Authority Blueprint",
    text: "Architectural schematics from 1952: showing how Varos-Meridian's reinforced concrete stairwells and load-bearing cores were designed to survive heavy artillery bombardments as civilian fallout shelters.",
  },
  {
    id: "d19",
    title: "Field Medic’s Triage Note",
    text: "Triage Surgeon Dr. Aris: 'Treated three East soldiers and two West operators in the same basement tonight. All five had shrapnel from the exact same batch of Consortium 82mm mortar shells.'",
  },
  {
    id: "d20",
    title: "The Gold Ledger Excerpt: Account 'Prometheus'",
    text: "Escrow ledger entry: Account #881-Prometheus holds twelve metric tons of bullion, authorized to release payments to defense contractors only while the city remains designated an active combat zone.",
  },
  {
    id: "d21",
    title: "Syndicate Manifesto: The Iron Meridian",
    text: "Partisan broadsheet: 'We were born between the borders. We will not be Eastern serfs or Western consumers. Every floor we hold, every stairwell we defend is sovereign ground.'",
  },
  {
    id: "d22",
    title: "Confession of Vault Engineer M. Kovacs",
    text: "Recorded audio file: 'They forced me to wire the seismic triggers into the foundation pillars. If the Consortium loses the central bank, Varga intends to bring the entire block down with him.'",
  },
  {
    id: "d23",
    title: "Intercepted Eastern Pact Recon Cable",
    text: "Recon Recon-9: 'The enemy isn't Western Coalition regulars. It's unmarked Ashgrove mercenaries wearing sanitized uniforms. Someone has orchestrated this war from the center of the city.'",
  },
  {
    id: "d24",
    title: "Hale's Declassified Dossier: The Cost of Neutrality",
    text: "Hale: 'When this is over, they’ll write that Varos-Meridian fell because it had no allies. The truth is worse: it fell because everyone was its customer. We finish this today, or nobody leaves.'",
  },
];
