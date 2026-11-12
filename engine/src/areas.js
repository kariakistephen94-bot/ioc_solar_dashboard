// Target areas for niche location search. lat/lon/radius (metres) drive the OpenStreetMap query.
// Edit freely: add any neighbourhood or town. `state` is only a label for filtering.
export const AREAS = [
  // Lagos: dense commercial suburbs where generators run most of the day
  ['Ikeja', 'Lagos', 6.6018, 3.3515, 6000], ['Alimosho / Egbeda', 'Lagos', 6.5833, 3.2833, 7000],
  ['Ikorodu', 'Lagos', 6.6194, 3.5105, 8000], ['Agege / Ifako', 'Lagos', 6.6200, 3.3200, 5000],
  ['Surulere', 'Lagos', 6.5000, 3.3500, 5000], ['Yaba / Ebute Metta', 'Lagos', 6.5095, 3.3711, 4500],
  ['Oshodi / Isolo', 'Lagos', 6.5550, 3.3400, 5000], ['Mushin', 'Lagos', 6.5290, 3.3560, 4000],
  ['Apapa / Ijora', 'Lagos', 6.4480, 3.3590, 5000], ['Festac / Amuwo-Odofin', 'Lagos', 6.4650, 3.2830, 6000],
  ['Ojo / Okokomaiko', 'Lagos', 6.4650, 3.1900, 7000], ['Badagry', 'Lagos', 6.4150, 2.8800, 8000],
  ['Epe', 'Lagos', 6.5840, 3.9830, 8000], ['Ajah / Sangotedo', 'Lagos', 6.4698, 3.5852, 7000],
  ['Lekki / Chevron', 'Lagos', 6.4400, 3.5000, 7000], ['Victoria Island / Ikoyi', 'Lagos', 6.4350, 3.4200, 5000],
  ['Maryland / Ikeja GRA', 'Lagos', 6.5740, 3.3660, 4000], ['Ogba / Ojodu / Berger', 'Lagos', 6.6400, 3.3500, 5000],
  // Ogun
  ['Abeokuta', 'Ogun', 7.1475, 3.3619, 9000], ['Sagamu', 'Ogun', 6.8390, 3.6460, 6000], ['Ota / Sango', 'Ogun', 6.6890, 3.2300, 8000],
  // Oyo (OIC Solar's home market)
  ['Ibadan (Central)', 'Oyo', 7.3775, 3.9470, 9000], ['Ibadan (Bodija / Ojoo)', 'Oyo', 7.4300, 3.9100, 6000],
  ['Ibadan (Iyaganku / Challenge)', 'Oyo', 7.3500, 3.8800, 6000], ['Ogbomosho', 'Oyo', 8.1337, 4.2400, 6000],
  ['Oyo town', 'Oyo', 7.8500, 3.9300, 5000], ['Iseyin / Saki', 'Oyo', 7.9700, 3.6000, 6000],
  // Other South-West
  ['Osogbo', 'Osun', 7.7710, 4.5560, 7000], ['Ile-Ife', 'Osun', 7.4900, 4.5600, 6000], ['Ilorin', 'Kwara', 8.4966, 4.5421, 9000],
  ['Akure', 'Ondo', 7.2526, 5.1931, 8000], ['Ado-Ekiti', 'Ekiti', 7.6210, 5.2210, 7000],
  // South-South / South-East
  ['Port Harcourt', 'Rivers', 4.8156, 7.0498, 10000], ['Benin City', 'Edo', 6.3350, 5.6037, 9000], ['Warri / Effurun', 'Delta', 5.5160, 5.7500, 8000],
  ['Uyo', 'Akwa Ibom', 5.0377, 7.9128, 7000], ['Calabar', 'Cross River', 4.9757, 8.3417, 7000], ['Enugu', 'Enugu', 6.4584, 7.5464, 9000],
  ['Onitsha', 'Anambra', 6.1498, 6.7857, 6000], ['Nnewi / Awka', 'Anambra', 6.0100, 6.9100, 7000], ['Aba', 'Abia', 5.1066, 7.3667, 8000],
  ['Owerri', 'Imo', 5.4850, 7.0350, 8000],
  // North / FCT
  ['Abuja (Central / Wuse / Garki)', 'FCT', 9.0579, 7.4951, 9000], ['Abuja (Kubwa / Gwarinpa)', 'FCT', 9.1000, 7.3900, 9000],
  ['Kano', 'Kano', 12.0022, 8.5920, 10000], ['Kaduna', 'Kaduna', 10.5222, 7.4383, 9000], ['Jos', 'Plateau', 9.8965, 8.8583, 8000],
  ['Maiduguri', 'Borno', 11.8333, 13.1500, 8000], ['Sokoto', 'Sokoto', 13.0059, 5.2476, 7000], ['Minna', 'Niger', 9.6139, 6.5569, 6000],
  ['Makurdi', 'Benue', 7.7337, 8.5214, 6000], ['Lokoja', 'Kogi', 7.8000, 6.7333, 6000],
].map(([name, state, lat, lon, radius]) => ({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, state, lat, lon, radius }));

export const areaById = (id) => AREAS.find((a) => a.id === id);
