import { readFileSync, writeFileSync } from 'node:fs';
const data = JSON.parse(readFileSync('src/data/cities.json','utf8'));
const ALIAS = {
  'America/Argentina/Buenos_Aires':'America/Buenos_Aires',
  'Europe/Kyiv':'Europe/Kiev',
  'Asia/Kolkata':'Asia/Calcutta',
  'Asia/Kathmandu':'Asia/Katmandu',
  'Asia/Ho_Chi_Minh':'Asia/Saigon',
};
const valid = new Set(Intl.supportedValuesOf('timeZone'));
// fix the dropped rows by re-adding them with supported aliases
for (const [city,tz,lat,lon,pop] of [
  ['Buenos Aires','America/Buenos_Aires',-34.6037,-58.3816,3100000],
  ['Kyiv','Europe/Kiev',50.4501,30.5234,2950000],
  ['Delhi','Asia/Calcutta',28.6139,77.209,32000000],
  ['Mumbai','Asia/Calcutta',19.076,72.8777,20700000],
  ['Kolkata','Asia/Calcutta',22.5726,88.3639,4500000],
  ['Kathmandu','Asia/Katmandu',27.7172,85.324,1400000],
  ['Ho Chi Minh City','Asia/Saigon',10.8231,106.6297,8900000]]) {
  if (!data.find(d=>d.city===city)) data.push({ city, country:'', cc:'', tz, lat, lon, pop });
}
const C = {'America/Buenos_Aires':['Argentina','AR'],'Europe/Kiev':['Ukraine','UA'],'Asia/Calcutta':['India','IN'],'Asia/Katmandu':['Nepal','NP'],'Asia/Saigon':['Vietnam','VN']};
for (const d of data) {
  if (ALIAS[d.tz]) d.tz = ALIAS[d.tz];
  if (!d.country && C[d.tz]) [d.country, d.cc] = C[d.tz];
  if (!valid.has(d.tz)) console.error('STILL INVALID:', d.tz);
}
writeFileSync('src/data/cities.json', JSON.stringify(data));
console.log('total', data.length, 'cities,', new Set(data.map(d=>d.tz)).size, 'zones');
