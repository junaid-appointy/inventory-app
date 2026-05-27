// String table lifted from the Office Operations design bundle
// (project/tokens.jsx STR). Each entry is [English, Hindi].
// Add a new key here, then call useT()(key) in a screen.

export type Lang = 'en' | 'hi';

type Pair = readonly [string, string];

export const STR = {
  // App
  appName:         ['Office Operations',  'ऑफिस ऑपरेशन्स'],
  receiveItem:     ['Receive item',       'सामान लें'],
  confirmReceived: ['Confirm received',   'मिलना पक्का'],
  saveAndContinue: ['Save & continue',    'सेव और आगे'],
  quantityReceived:['Quantity received',  'मिली गिनती'],
  syncQueue:       ['Sync queue',         'भेजने की कतार'],
  syncQueueSub:    ['Review pending uploads', 'बाकी अपलोड देखें'],
  syncNow:         ['Sync now',           'अभी भेजें'],
  receipt:         ['Receipt',            'रसीद'],
  productMapping:  ['Product mapping',    'सामान मैपिंग'],
  reorderRequest:  ['Reorder request',    'दोबारा मँगवाना'],
  mismatchFlag:    ['Mismatch flag',      'फ़र्क का चिह्न'],
  product:         ['Product',            'सामान'],
  unknownProduct:  ['Unknown product',    'अनजान सामान'],
  expectedShort:   ['Expected',           'अपेक्षित'],
  alreadyReceived: ['already received',   'पहले मिला'],
  noMatchingOrder: ['No matching order',   'कोई ऑर्डर नहीं मिला'],
  greeting:        ['Hello',              'नमस्ते'],
  guard:           ['Guard at Gate',      'गेट सुरक्षाकर्मी'],
  settings:        ['Settings',           'सेटिंग्स'],
  signOut:         ['Sign out',           'लॉगआउट'],
  signIn:          ['Sign in',            'लॉग इन'],
  signedIn:        ['Signed in',          'लॉग-इन'],
  langSection:     ['LANGUAGE',           'भाषा'],
  appearanceSection:['APPEARANCE',        'दिखावट'],
  accountSection:  ['ACCOUNT',            'खाता'],
  themeLight:      ['Light',              'उजला'],
  themeDark:       ['Dark',               'अंधेरा'],

  // Filter labels
  filterCategory:  ['Category',           'श्रेणी'],
  filterStatus:    ['Status',             'स्थिति'],

  // Receiving / scanning actions
  tapToSelectDate: ['Tap to select date', 'तारीख चुनें'],
  addToOrder:      ['Add to Order',       'ऑर्डर में जोड़ें'],
  scanNextItem:    ['Scan Next Item',     'अगला स्कैन'],
  cancelOrder:     ['Cancel Order',       'ऑर्डर रद्द'],

  // Modules / home tiles
  receiving:       ['Receiving',          'सामान आना'],
  receivingSub:    ['Scan items at gate', 'गेट पर स्कैन करें'],
  stock:           ['Stock',              'स्टॉक'],
  stockSub:        ['Check shelf counts', 'शेल्फ़ गिनती'],
  issue:           ['Issue',              'देना'],
  issueSub:        ['Record what was used','खर्च दर्ज करें'],
  dispense:        ['Dispense',           'वितरण'],
  dispenseSub:     ['Record what was used','खर्च दर्ज करें'],
  alerts:          ['Alerts',             'अलर्ट'],
  alertsSub:       ['Low stock & reorder','कम स्टॉक'],

  // Generic actions
  next:            ['Next',               'आगे'],
  back:            ['Back',               'वापस'],
  done:            ['Done',               'पूरा'],
  cancel:          ['Cancel',             'रद्द'],
  confirm:         ['Confirm',            'पक्का करें'],
  save:            ['Save',               'सेव'],
  retry:           ['Retry',              'फिर से'],
  yes:             ['Yes',                'हाँ'],
  no:              ['No',                 'नहीं'],
  search:          ['Search…',            'खोजें…'],

  // Sync status
  online:          ['Online',             'ऑनलाइन'],
  offline:         ['Offline',            'ऑफ़लाइन'],
  syncing:         ['Syncing',            'सिंक हो रहा'],
  queued:          ['waiting to send',    'भेजने को तैयार'],
  allSynced:       ['All synced',         'सब भेज दिया'],

  // Receiving / orders
  expectedToday:   ['Expected today',     'आज की डिलिवरी'],
  awaited:         ['Awaited',            'इंतज़ार में'],
  doneToday:       ['Done today',         'आज पूरी हुई'],
  vendor:          ['Vendor',             'विक्रेता'],
  items:           ['items',              'सामान'],
  truckArrived:    ['Truck arrived?',     'गाड़ी आ गई?'],
  startScanning:   ['Start scanning',     'स्कैन शुरू करें'],

  // Scanner
  scanItem:        ['Point at barcode',   'बारकोड पर रखें'],
  holdSteady:      ['Hold steady',        'थोड़ा रुकिए'],
  flashOn:         ['Flash',              'फ्लैश'],
  enterCode:       ['Type code',          'कोड टाइप करें'],
  newCode:         ['New barcode',        'नया बारकोड'],

  // Confirm scanned
  expected:        ['Expected',           'अपेक्षित'],
  scanned:         ['Scanned',            'स्कैन हुआ'],
  remaining:       ['Remaining',          'बाकी'],
  setCount:        ['Set count',          'गिनती'],
  category:        ['Category',           'श्रेणी'],
  unit:            ['Unit',               'इकाई'],

  // Mismatch
  mismatch:        ['Quantity mismatch',  'गिनती में फ़र्क'],
  shortBy:         ['short by',           'कम है'],
  extra:           ['extra',              'ज़्यादा'],
  flagAndContinue: ['Flag & continue',    'फ़्लैग करें'],
  recount:         ['Re-count',           'फिर गिनें'],

  // Register
  newProduct:      ['New product',        'नया सामान'],
  takePhoto:       ['Photo of label',     'लेबल की फ़ोटो'],
  productName:     ['What is this?',      'यह क्या है?'],
  pickCategory:    ['Pick a category',    'श्रेणी चुनें'],
  pickUnit:        ['Pick a unit',        'इकाई चुनें'],

  // Proof
  proofPhoto:      ['Photo of delivery',  'डिलिवरी की फ़ोटो'],
  proofHint:       ['One photo of all items together', 'सब सामान की एक फ़ोटो'],
  takeAnother:     ['Take another',       'और फ़ोटो'],

  // Summary
  deliveryDone:    ['Delivery received',  'डिलिवरी मिल गई'],
  willSyncLater:   ['Will send when online','ऑनलाइन होने पर भेजेंगे'],
  backHome:        ['Back to home',       'होम पर जाएँ'],

  // Stock
  lowStock:        ['Low stock',          'कम स्टॉक'],
  okStock:         ['In stock',           'स्टॉक में'],
  outStock:        ['Out',                'खत्म'],
  onHand:          ['on hand',            'मौजूद'],

  // Issue / consume
  whoTook:         ['Who took it?',       'किसने लिया?'],
  howMany:         ['How many?',          'कितने?'],
  reason:          ['Reason',             'कारण'],

  // Reorder
  requestReorder:  ['Request reorder',    'फिर मँगवाएँ'],
  reorderSent:     ['Request sent',       'अनुरोध भेजा'],

  // Categories
  catStationery:   ['Stationery',         'स्टेशनरी'],
  catCleaning:     ['Cleaning',           'सफाई'],
  catPantry:       ['Pantry',             'पैंट्री'],
  catIT:           ['IT supplies',        'आईटी सामान'],

  // Units
  unitPiece:       ['Piece',              'पीस'],
  unitPack:        ['Pack',               'पैकेट'],
  unitBox:         ['Box',                'डिब्बा'],
  unitKg:          ['Kg',                 'किलो'],
  unitLitre:       ['Litre',              'लीटर'],

  // Scanner permissions & manual entry
  allowCamera:     ['Allow camera',       'कैमरा दें'],
  notNow:          ['Not now',            'अभी नहीं'],
  noCamera:        ['No camera available', 'कैमरा नहीं मिला'],
  cameraNeeded:    ['Camera access needed','कैमरा चाहिए'],
  useCode:         ['Use code',           'कोड डालें'],

  // Dispense / issue form
  nameOptional:    ['Name (optional)',    'नाम (वैकल्पिक)'],
  submitOrder:     ['Submit Order',       'ऑर्डर भेजें'],

  // Login
  guardName:       ['Guard name',         'गार्ड का नाम'],
  guardNameHint:   ['As registered by your supervisor', 'आपके सुपरवाइज़र ने जो लिखा'],
  cameraHint:      ['We use the camera only to read barcodes — no photos are taken.', 'कैमरा सिर्फ़ बारकोड पढ़ने के लिए — कोई फ़ोटो नहीं।'],

  // Login form extras
  pin:             ['PIN',                'पिन'],
  pinHint:         ['4–6 digits',         '4–6 अंक'],
  select:          ['Select',             'चुनें'],

  // Placeholders
  productExample:  ['e.g. Tata Salt 1kg', 'जैसे टाटा नमक 1kg'],
  barcodeExample:  ['e.g. 8901030875021', 'जैसे 8901030875021'],
} as const satisfies Record<string, Pair>;

export type StringKey = keyof typeof STR;

export function translate(key: StringKey, lang: Lang): string {
  const entry = STR[key];
  if (!entry) return key;
  return lang === 'hi' ? entry[1] : entry[0];
}
