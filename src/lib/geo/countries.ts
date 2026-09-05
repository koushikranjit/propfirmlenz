/**
 * ISO 3166-1 alpha-2 countries — reference data, not business data.
 *
 * The database stores the two-letter CODE (`prop_firms.headquarters_country`,
 * CHECK-constrained to `^[A-Z]{2}$`). The name and flag are derived here, so a
 * country renaming is a one-line change rather than a data migration, and no
 * firm row ever holds a display string that can drift.
 *
 * FLAGS ARE DERIVED, NOT LISTED. A flag emoji is the two letters of the code
 * shifted into the Unicode regional-indicator block, so the flag cannot
 * disagree with the code beside it.
 */

/** `"GB"` → `"🇬🇧"`. Returns null for anything that is not two letters. */
export function countryFlag(code: string | null | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  const REGIONAL_INDICATOR_A = 0x1f1e6;
  const LETTER_A = 65;
  return [...code.toUpperCase()]
    .map((ch) =>
      String.fromCodePoint(
        REGIONAL_INDICATOR_A + (ch.charCodeAt(0) - LETTER_A),
      ),
    )
    .join("");
}

/**
 * `code:Name`, one per line. Compact on purpose — 249 object literals would be
 * four times the size for the same two fields.
 */
const RAW = `
AD:Andorra
AE:United Arab Emirates
AF:Afghanistan
AG:Antigua and Barbuda
AI:Anguilla
AL:Albania
AM:Armenia
AO:Angola
AQ:Antarctica
AR:Argentina
AS:American Samoa
AT:Austria
AU:Australia
AW:Aruba
AX:Åland Islands
AZ:Azerbaijan
BA:Bosnia and Herzegovina
BB:Barbados
BD:Bangladesh
BE:Belgium
BF:Burkina Faso
BG:Bulgaria
BH:Bahrain
BI:Burundi
BJ:Benin
BL:Saint Barthélemy
BM:Bermuda
BN:Brunei
BO:Bolivia
BQ:Caribbean Netherlands
BR:Brazil
BS:Bahamas
BT:Bhutan
BV:Bouvet Island
BW:Botswana
BY:Belarus
BZ:Belize
CA:Canada
CC:Cocos (Keeling) Islands
CD:Democratic Republic of the Congo
CF:Central African Republic
CG:Republic of the Congo
CH:Switzerland
CI:Côte d'Ivoire
CK:Cook Islands
CL:Chile
CM:Cameroon
CN:China
CO:Colombia
CR:Costa Rica
CU:Cuba
CV:Cabo Verde
CW:Curaçao
CX:Christmas Island
CY:Cyprus
CZ:Czechia
DE:Germany
DJ:Djibouti
DK:Denmark
DM:Dominica
DO:Dominican Republic
DZ:Algeria
EC:Ecuador
EE:Estonia
EG:Egypt
EH:Western Sahara
ER:Eritrea
ES:Spain
ET:Ethiopia
FI:Finland
FJ:Fiji
FK:Falkland Islands
FM:Micronesia
FO:Faroe Islands
FR:France
GA:Gabon
GB:United Kingdom
GD:Grenada
GE:Georgia
GF:French Guiana
GG:Guernsey
GH:Ghana
GI:Gibraltar
GL:Greenland
GM:Gambia
GN:Guinea
GP:Guadeloupe
GQ:Equatorial Guinea
GR:Greece
GS:South Georgia and the South Sandwich Islands
GT:Guatemala
GU:Guam
GW:Guinea-Bissau
GY:Guyana
HK:Hong Kong
HM:Heard Island and McDonald Islands
HN:Honduras
HR:Croatia
HT:Haiti
HU:Hungary
ID:Indonesia
IE:Ireland
IL:Israel
IM:Isle of Man
IN:India
IO:British Indian Ocean Territory
IQ:Iraq
IR:Iran
IS:Iceland
IT:Italy
JE:Jersey
JM:Jamaica
JO:Jordan
JP:Japan
KE:Kenya
KG:Kyrgyzstan
KH:Cambodia
KI:Kiribati
KM:Comoros
KN:Saint Kitts and Nevis
KP:North Korea
KR:South Korea
KW:Kuwait
KY:Cayman Islands
KZ:Kazakhstan
LA:Laos
LB:Lebanon
LC:Saint Lucia
LI:Liechtenstein
LK:Sri Lanka
LR:Liberia
LS:Lesotho
LT:Lithuania
LU:Luxembourg
LV:Latvia
LY:Libya
MA:Morocco
MC:Monaco
MD:Moldova
ME:Montenegro
MF:Saint Martin
MG:Madagascar
MH:Marshall Islands
MK:North Macedonia
ML:Mali
MM:Myanmar
MN:Mongolia
MO:Macao
MP:Northern Mariana Islands
MQ:Martinique
MR:Mauritania
MS:Montserrat
MT:Malta
MU:Mauritius
MV:Maldives
MW:Malawi
MX:Mexico
MY:Malaysia
MZ:Mozambique
NA:Namibia
NC:New Caledonia
NE:Niger
NF:Norfolk Island
NG:Nigeria
NI:Nicaragua
NL:Netherlands
NO:Norway
NP:Nepal
NR:Nauru
NU:Niue
NZ:New Zealand
OM:Oman
PA:Panama
PE:Peru
PF:French Polynesia
PG:Papua New Guinea
PH:Philippines
PK:Pakistan
PL:Poland
PM:Saint Pierre and Miquelon
PN:Pitcairn Islands
PR:Puerto Rico
PS:Palestine
PT:Portugal
PW:Palau
PY:Paraguay
QA:Qatar
RE:Réunion
RO:Romania
RS:Serbia
RU:Russia
RW:Rwanda
SA:Saudi Arabia
SB:Solomon Islands
SC:Seychelles
SD:Sudan
SE:Sweden
SG:Singapore
SH:Saint Helena
SI:Slovenia
SJ:Svalbard and Jan Mayen
SK:Slovakia
SL:Sierra Leone
SM:San Marino
SN:Senegal
SO:Somalia
SR:Suriname
SS:South Sudan
ST:Sao Tome and Principe
SV:El Salvador
SX:Sint Maarten
SY:Syria
SZ:Eswatini
TC:Turks and Caicos Islands
TD:Chad
TF:French Southern Territories
TG:Togo
TH:Thailand
TJ:Tajikistan
TK:Tokelau
TL:Timor-Leste
TM:Turkmenistan
TN:Tunisia
TO:Tonga
TR:Türkiye
TT:Trinidad and Tobago
TV:Tuvalu
TW:Taiwan
TZ:Tanzania
UA:Ukraine
UG:Uganda
UM:United States Minor Outlying Islands
US:United States
UY:Uruguay
UZ:Uzbekistan
VA:Vatican City
VC:Saint Vincent and the Grenadines
VE:Venezuela
VG:British Virgin Islands
VI:United States Virgin Islands
VN:Vietnam
VU:Vanuatu
WF:Wallis and Futuna
WS:Samoa
YE:Yemen
YT:Mayotte
ZA:South Africa
ZM:Zambia
ZW:Zimbabwe
`;

export interface Country {
  code: string;
  name: string;
  flag: string;
}

/** Alphabetical by name, which is the order a person scans them in. */
export const COUNTRIES: readonly Country[] = RAW.trim()
  .split("\n")
  .map((line) => {
    const separator = line.indexOf(":");
    const code = line.slice(0, separator);
    return { code, name: line.slice(separator + 1), flag: countryFlag(code)! };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** Null for an unknown code — never the raw code dressed up as a name. */
export function country(code: string | null | undefined): Country | null {
  return code ? (BY_CODE.get(code.toUpperCase()) ?? null) : null;
}

export function isCountryCode(code: string): boolean {
  return BY_CODE.has(code.toUpperCase());
}
