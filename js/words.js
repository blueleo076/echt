/*
 * ECHT – Wortlisten für die gesprochenen Codes (Deutsch und Englisch).
 *
 * ACHTUNG: Reihenfolge und Inhalt sind Teil des Protokolls. Jedes Wort steht für einen Byte-Wert (0–255),
 * das deutsche und das englische Wort einer Position bedeuten dasselbe. Wer die Liste ändert, erzeugt Codes,
 * die zu älteren Installationen nicht mehr passen. Darum nur mit neuer Protokollversion ändern.
 *
 * Warum zwei Listen? Eine Person mit deutscher App und eine mit englischer App sollen sich am Telefon
 * verstehen. Jede App zeigt die Wörter in ihrer Sprache und erkennt beim Prüfen beide Sprachen.
 *
 * Auswahl: genau 256 Alltagswörter je Sprache, nur a–z (deutsche Umlaute als ae/oe/ue), leicht zu sprechen
 * und am Telefon schwer zu verwechseln. Ein Wort darf nicht in beiden Listen an verschiedenen Positionen stehen
 * (das prüfen die Tests); gleich geschriebene Wörter (tiger, hammer, …) stehen an derselben Position.
 * Format der Paare: deutsch:englisch.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EchtWords = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PAIRS = `
    adler:eagle anker:anchor apfel:apple amsel:blackbird acker:field abend:evening atlas:atlas aster:aster
    baum:tree bagger:digger balkon:balcony banane:banana besen:broom biber:beaver birne:pear blatt:leaf blume:flower boden:floor boot:boat brief:letter brot:bread bruecke:bridge buch:book buerste:brush bus:bus butter:butter
    cello:cello clown:clown creme:cream
    dach:roof dackel:dachshund daumen:thumb decke:blanket delfin:dolphin dorf:village drache:dragon dusche:shower
    efeu:ivy eiche:oak eimer:bucket eisen:iron elch:moose enkel:ankle ente:duck erbse:lentil esel:donkey essig:vinegar
    fabrik:factory faden:thread fahne:flag falke:falcon farbe:paint feder:feather fenster:window ferien:holiday fisch:fish flasche:bottle flamme:flame floete:flute fluss:river forelle:trout frosch:frog fuchs:fox futter:feed
    gabel:fork garten:garden geige:violin gipfel:summit glocke:bell gurke:cucumber gans:goose gitarre:guitar
    hafen:harbor hahn:rooster hammer:hammer harfe:harp hase:hare hecht:pike hemd:shirt honig:honey hose:trousers hummel:bumblebee hund:dog hut:hat
    igel:hedgehog insel:island iglu:igloo
    jacke:jacket jaguar:jaguar
    kaefer:beetle kaffee:coffee kamel:camel kanu:canoe karte:map katze:cat kerze:candle kiefer:pine kirche:church kissen:pillow kleid:dress klee:clover knopf:button koffer:suitcase krone:crown kuchen:cake kugel:ball kuh:cow kuerbis:pumpkin
    lampe:lamp laub:foliage leiter:ladder lerche:lark licht:light linde:linden loewe:lion loeffel:spoon luchs:lynx luft:air
    maus:mouse magnet:magnet mantel:coat marder:marten mauer:wall meer:sea melone:melon messer:knife milch:milk mond:moon moos:lichen muehle:mill muschel:seashell
    nadel:needle nebel:fog nest:nest nuss:nut nelke:carnation nashorn:rhino
    ofen:oven ohr:ear olive:olive oper:opera orgel:organ otter:otter ozean:ocean
    palme:palm papier:paper pferd:horse pilz:mushroom pinsel:paintbrush pizza:pizza planet:planet pudding:pudding pfanne:pan
    quelle:spring quark:curd
    rabe:raven rad:wheel radio:radio regen:rain reh:deer reis:rice ring:ring rose:rose rucksack:backpack rutsche:slide
    sack:sack saft:juice salat:salad salz:salt sand:sand schaf:sheep schiff:ship schuh:shoe schwan:swan see:lake seife:soap seil:rope sessel:armchair sofa:sofa sonne:sun spiegel:mirror stern:star stiefel:sandal strand:beach stuhl:chair suppe:soup
    tafel:board tasche:bag tasse:cup taube:pigeon teller:plate tiger:tiger tisch:table topf:pot traktor:tractor treppe:stairs tulpe:tulip turm:tower
    uhr:clock ufer:shore unkraut:weed
    vase:vase veilchen:violet vogel:bird vulkan:volcano
    wabe:honeycomb wagen:cart wald:forest walnuss:walnut wasser:water watte:cotton wecker:alarm wiese:meadow wind:wind wolke:cloud wolf:wolf wurm:worm wurzel:radish welle:wave
    zebra:zebra zelt:tent ziege:goat zimmer:kitchen zitrone:lemon zucker:sugar zwiebel:onion zaun:fence zirkus:circus
    dattel:date donner:thunder eule:owl bohne:bean flur:hallway gold:gold gras:grass giraffe:giraffe hirsch:stag hotel:hotel kabel:cable kran:crane lilie:lily mango:mango
    marmor:marble pirat:pirate pony:pony ritter:knight rakete:rocket roller:scooter schal:scarf segel:sail specht:woodpecker storch:stork tanne:fir tinte:ink waage:scale zange:pliers
  `;
  const de = [];
  const en = [];
  PAIRS.split(/\s+/).filter(Boolean).forEach((pair) => {
    const [d, e] = pair.split(':');
    de.push(d);
    en.push(e);
  });
  return { de, en };
});
