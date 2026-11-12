// Which businesses buy solar/inverter backup, and how strongly. Score = how much a business suffers from power cuts.
// Rules are tested against OpenStreetMap tags, then the business name (for CSV / Google imports).
const RULES = [
  { sector: 'Cold room / fresh food', score: 60, signal: 'Cold storage and freezers spoil within hours of an outage', tag: /^(shop=(butcher|seafood|farm|greengrocer|deli|dairy)|craft=(bakery|confectionery))$/, name: /cold ?room|cold ?store|frozen|fish|meat|poultry|abattoir|ice ?(block|cream)|bakery|supermart|supermarket/i },
  { sector: 'Hospital / clinic', score: 60, signal: 'Patient equipment and vaccines need uninterrupted power', tag: /^amenity=(hospital|clinic|doctors|dentist|laboratory)$|^healthcare=/, name: /hospital|clinic|diagnostic|medical|dental|laborator|maternity|health ?cent/i },
  { sector: 'Hotel / guest house', score: 58, signal: 'Guests expect 24/7 power, AC and water pumping', tag: /^tourism=(hotel|guest_house|motel|hostel)$/, name: /hotel|guest ?house|lodge|resort|inn$|suites/i },
  { sector: 'Pharmacy', score: 52, signal: 'Fridge-stored medicines and long opening hours', tag: /^amenity=pharmacy$|^shop=chemist$/, name: /pharm|chemist/i },
  { sector: 'Supermarket / mall', score: 55, signal: 'Refrigeration, lighting and tills run all day on generator', tag: /^shop=(supermarket|mall|department_store|convenience|wholesale)$/, name: /supermarket|mall|plaza|wholesale/i },
  { sector: 'Restaurant / bar / event centre', score: 48, signal: 'Kitchens, freezers and AC burn through generator fuel', tag: /^amenity=(restaurant|bar|pub|cafe|nightclub|fast_food|events_venue)$/, name: /restaurant|bar$|lounge|grill|kitchen|event ?cent|banquet|suya/i },
  { sector: 'School / training centre', score: 45, signal: 'Classrooms, ICT labs and hostels need daytime power', tag: /^amenity=(school|college|university|kindergarten|training)$/, name: /school|college|academy|institute|polytechnic|nursery/i },
  { sector: 'Bank / microfinance / ATM', score: 50, signal: 'Branches and ATMs must stay online', tag: /^amenity=(bank|atm|bureau_de_change)$/, name: /bank|microfinance|mfb|bureau de change|atm/i },
  { sector: 'Fuel station', score: 50, signal: 'Pumps and forecourt lighting depend on constant power', tag: /^amenity=fuel$/, name: /filling station|petrol|fuel|oil & gas/i },
  { sector: 'Factory / workshop', score: 55, signal: 'Machines stall and output is lost on every outage', tag: /^(industrial=|craft=(carpenter|metal_construction|tailor|welder|electronics_repair|printer|sawmill)|man_made=(works|water_works))/, name: /factory|industries|manufactur|mill$|printing|workshop|plastics|packaging|bottling|table water/i },
  { sector: 'Office / ICT / business centre', score: 42, signal: 'Computers, servers and AC run on generator in office hours', tag: /^(office=(company|it|ngo|insurance|estate_agent|lawyer|accountant)|shop=(computer|copyshop|mobile_phone|electronics))/, name: /cyber|ict|business ?cent|solutions|technolog|consult|telecom|computer/i },
  { sector: 'Salon / barber / laundry', score: 38, signal: 'Dryers, clippers and irons need steady power for long hours', tag: /^(shop=(hairdresser|beauty|laundry|dry_cleaning)|craft=hairdresser)$/, name: /salon|barber|beauty|spa$|laundry|dry ?clean/i },
  { sector: 'Church / mosque / worship centre', score: 35, signal: 'PA systems, fans and lights on generator during services', tag: /^amenity=place_of_worship$/, name: /church|cathedral|mosque|ministr|tabernacle|chapel/i },
  { sector: 'Farm / agro business', score: 45, signal: 'Irrigation pumps, hatcheries and cold chains', tag: /^(landuse=farm|craft=agricultural)|^shop=agrarian$/, name: /farm|agro|hatchery|fishery|plantation/i },
  { sector: 'Shop / retail', score: 30, signal: 'Fans, lights and small freezers on petrol generator', tag: /^shop=/, name: /store|stores|shop|ventures|enterprises|trading/i },
];
// Competitors are not leads for a solar retailer's end-customer pitch.
const COMPETITOR = /solar|inverter|renewable|power ?solutions|generator|electrical|energy limited|battery/i;

export function classify({ tags = {}, name = '' }) {
  if (COMPETITOR.test(name)) return null;
  const pairs = Object.entries(tags).map(([k, v]) => `${k}=${v}`);
  for (const r of RULES) if (pairs.some((p) => r.tag.test(p))) return r;
  for (const r of RULES) if (r.name.test(name)) return r;
  return null;
}

/** 0-100. Sector fit plus how reachable the lead is on WhatsApp. */
export function scoreLead({ rule, phone_type, website, email }) {
  return Math.min(100, (rule?.score ?? 25) + (phone_type === 'mobile' ? 30 : 0) + (website ? 5 : 0) + (email ? 5 : 0));
}
export const SECTOR_LIST = RULES.map((r) => r.sector);
export const sectorRules = RULES;
