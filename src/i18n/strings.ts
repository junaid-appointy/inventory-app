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
  guard:           ['Support Staff',       'सपोर्ट स्टाफ'],
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
  unitValue:       ['Unit value',         'मात्रा'],
  unitValueHint:   ['e.g. 1, 5, 500',     'जैसे 1, 5, 500'],

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
  guardName:       ['Your name',          'आपका नाम'],
  guardNameHint:   ['As registered by your supervisor', 'आपके सुपरवाइज़र ने जो लिखा'],
  cameraHint:      ['We use the camera only to read barcodes — no photos are taken.', 'कैमरा सिर्फ़ बारकोड पढ़ने के लिए — कोई फ़ोटो नहीं।'],

  // Login form extras
  pin:             ['PIN',                'पिन'],
  pinHint:         ['4–6 digits',         '4–6 अंक'],
  select:          ['Select',             'चुनें'],
  signInWithPin:   ['Sign in with your name and PIN.', 'अपने नाम और पिन से लॉग इन करें।'],
  signingIn:       ['Signing in…',        'लॉग-इन हो रहा…'],
  fillDetailsError:['Please enter your name and a 4-6 digit PIN.', 'कृपया अपना नाम और 4-6 अंकों का पिन दर्ज करें।'],

  // Placeholders
  productExample:  ['e.g. Tata Salt 1kg', 'जैसे टाटा नमक 1kg'],
  barcodeExample:  ['e.g. 8901030875021', 'जैसे 8901030875021'],

  // Catalog picker / search
  pickProduct:        ['Pick product',                       'सामान चुनें'],
  itemsInCatalog:     ['items in catalog',                   'कैटलॉग में'],
  itemInCatalog:      ['item in catalog',                    'कैटलॉग में'],
  searchPlaceholder:  ['Type product name, category or HSN…','सामान का नाम, श्रेणी या HSN टाइप करें…'],
  noExactMatch:       ['No exact match. Tap "Did you mean" below or flag with a photo.', 'कोई मेल नहीं। नीचे "क्या आपका मतलब" पर टैप करें या फ़ोटो से फ़्लैग करें।'],
  didYouMean:         ['Did you mean:',                      'क्या आपका मतलब:'],
  notInList:          ['Not in this list? Flag with a photo','सूची में नहीं? फ़ोटो से फ़्लैग करें'],
  expectedFromOrders: ['Expected from open orders',          'खुले ऑर्डर से अपेक्षित'],

  // Register product / scan
  barcodeWillBeLinked: ['Barcode will be linked to',         'बारकोड जुड़ जाएगा:'],
  saveCustom:         ['Save & continue',                    'सेव और आगे'],
  linkAndContinue:    ['Link & continue',                    'जोड़ें और आगे'],
  registerNewProduct: ['Register new product',               'नया सामान दर्ज करें'],
  noProductsCached:   ['No products cached yet',             'कैटलॉग खाली है'],

  // Misc
  refresh:            ['Refresh',                            'रिफ़्रेश'],
  clear:              ['Clear',                              'मिटाएँ'],
  remove:             ['Remove',                             'हटाएँ'],
  add:                ['Add',                                'जोड़ें'],
  edit:               ['Edit',                               'बदलें'],
  noExpiry:           ['No expiry date',                     'कोई एक्सपायरी नहीं'],
  noBarcodeYet:       ['No barcode yet',                     'अभी बारकोड नहीं'],
  perPackExpiry:      ['Different expiry per pack',          'हर पैक की अलग एक्सपायरी'],
  pack:               ['Pack',                               'पैक'],
  expiryDate:         ['Expiry date',                        'एक्सपायरी की तारीख'],
  packsLabel:         ['packs',                               'पैक'],

  // Edit stock (correction flow)
  editStock:          ['Edit stock',                           'स्टॉक बदलें'],
  editStockSub:       ['Update count or expiry',               'गिनती या एक्सपायरी बदलें'],
  currentCount:       ['Current count',                        'अभी की गिनती'],
  newCount:           ['New count',                            'नई गिनती'],
  saveChanges:        ['Save changes',                         'सेव करें'],
  noChanges:          ['No changes',                           'कोई बदलाव नहीं'],

  // JIT verification + freshness UX
  verifying:          ['Verifying…',                            'जाँच हो रही…'],
  couldntVerify:      ["Couldn't verify — try again",           'जाँच नहीं हुई — फिर कोशिश करें'],
  dispenseOfflineNote:['Offline — using your saved count',      'ऑफ़लाइन — आपकी सेव की गई गिनती इस्तेमाल हो रही है'],
  itemNotOnServer:    ['This item is not on the server yet',    'यह सामान अभी सर्वर पर नहीं है'],
  refreshingLabel:    ['Refreshing…',                           'रीफ़्रेश हो रहा…'],
  offlineBanner:      ['Offline — showing saved data',          'ऑफ़लाइन — सेव किया हुआ दिखा रहे हैं'],
  loginNeedsInternet: ['Login needs internet',                  'लॉगिन के लिए इंटरनेट ज़रूरी है'],
  stockUpdatedTitle:  ['Stock updated',                         'स्टॉक बदला'],
  stockUpdatedBody:   ['Stock has changed since you opened this screen.', 'जब से आपने यह स्क्रीन खोली, स्टॉक बदला है।'],
  useNewCount:        ['Use new count',                         'नई गिनती लें'],
  keepMyEdit:         ['Keep my edit',                          'मेरा बदलाव रखें'],

  // Settings → Data section
  dataSection:        ['DATA',                                'डेटा'],
  clearLocalData:     ['Clear local data',                    'स्थानीय डेटा मिटाएँ'],
  clearLocalDataHelp: [
    'Wipes cached stock, orders, catalog, learned barcodes, and pending sync writes. Receipts you have scanned are kept. Use this after the admin resets inventory data on the server.',
    'स्थानीय स्टॉक, ऑर्डर, कैटलॉग, सीखे गए बारकोड और भेजने वाले डेटा को मिटा देगा। आपके स्कैन की गई रसीदें सुरक्षित रहेंगी। इसका उपयोग तब करें जब एडमिन ने सर्वर पर डेटा रीसेट किया हो।',
  ],
  clearing:           ['Clearing…',                           'मिटाया जा रहा…'],

  // Dispense
  quantityToTake:     ['How many to take?',                  'कितने लेने हैं?'],

  // Batches (per-expiry lots)
  batches:            ['Batches',                            'बैच'],
  batchesSub:         ['One row per expiry',                 'हर एक्सपायरी की एक पंक्ति'],
  addBatch:           ['+ Add another expiry batch',         '+ और एक्सपायरी जोड़ें'],
  removeBatch:        ['Remove batch',                       'बैच हटाएँ'],
  totalLabel:         ['Total',                              'कुल'],
  pickFromBatch:      ['Pick from batch',                    'इस बैच से लें'],
  suggested:          ['suggested',                          'सुझाया'],
  inStock:            ['in stock',                           'स्टॉक में'],
  takenTotal:         ['Taken',                              'लिया'],
  ofTotal:            ['of',                                 'का'],

  // Errors
  errorOccurred:      ['Something went wrong',               'कुछ गड़बड़ हुई'],
  tryAgain:           ['Try again',                          'फिर कोशिश करें'],
  networkOffline:     ['Offline — will sync when online',    'ऑफ़लाइन — ऑनलाइन होने पर भेजेंगे'],

  // Connectivity banner
  backOnline:         ['Back online',                        'फिर ऑनलाइन'],

  // Generic in-progress label (Button loading state)
  working:            ['Working…',                           'हो रहा है…'],

  // Status filter options (label only — filter logic keys off the key)
  statusAll:          ['All Status',                         'सभी स्थिति'],
  statusInStock:      ['In Stock',                           'स्टॉक में'],
  statusLow:          ['Low',                                'कम'],
  statusOut:          ['Out of Stock',                       'खत्म'],
  allCategories:      ['All Categories',                     'सभी श्रेणियाँ'],

  // Empty / list states
  noItemsMatch:       ['No items match.',                    'कोई सामान नहीं मिला।'],
  nothingMatches:     ['Nothing matches',                    'कुछ नहीं मिला'],
  tryDifferentFilter: ['Try a different filter or clear the search.', 'दूसरा फ़िल्टर आज़माएँ या खोज मिटाएँ।'],
  allStockedUp:       ['All stocked up',                     'सब स्टॉक में'],
  nothingBelowThreshold: ['Nothing is below its threshold right now.', 'अभी कुछ भी सीमा से नीचे नहीं है।'],
  noDeliveries:       ['No deliveries scheduled',            'कोई डिलिवरी तय नहीं'],
  ordersAppearHint:   ['Orders appear here once the office processes a bill.', 'ऑफिस के बिल प्रोसेस करते ही ऑर्डर यहाँ दिखेंगे।'],
  noItemsScanned:     ['No items scanned yet',               'अभी कोई सामान स्कैन नहीं'],

  // Dispense reasons (label only — canonical English value is stored)
  reasonOfficeUse:    ['Office use',                         'ऑफिस उपयोग'],
  reasonPantry:       ['Pantry',                             'पैंट्री'],
  reasonCleaning:     ['Cleaning',                           'सफाई'],
  reasonMaintenance:  ['Maintenance',                        'मेंटेनेंस'],
  reasonOther:        ['Other',                              'अन्य'],

  // Order session alerts
  removeItem:         ['Remove item',                        'सामान हटाएँ'],
  removeItemBody:     ['Remove "{name}" from this order?',   '"{name}" को इस ऑर्डर से हटाएँ?'],
  discardScannedItems:['Discard all {count} scanned items?', 'सभी {count} स्कैन किए सामान हटाएँ?'],
  keepScanning:       ['Keep scanning',                      'स्कैन जारी रखें'],
  discardAll:         ['Discard all',                        'सब हटाएँ'],

  // Sync queue (outbox)
  statusWaiting:      ['Waiting',                            'इंतज़ार में'],
  statusSending:      ['Sending…',                           'भेजा जा रहा…'],
  statusFailed:       ['Failed',                             'विफल'],
  everythingSent:     ['Everything has been sent to the server.', 'सब कुछ सर्वर पर भेज दिया गया है।'],
  clearQueue:         ['Clear queue',                        'कतार मिटाएँ'],
  clearQueueConfirm:  ['Clear sync queue?',                  'सिंक कतार मिटाएँ?'],
  clearQueueBody:     ['{count} pending items will be permanently deleted. They will NOT be sent to the server.', '{count} बाकी सामान हमेशा के लिए मिट जाएँगे। ये सर्वर पर नहीं भेजे जाएँगे।'],
  clearBtn:           ['Clear',                              'मिटाएँ'],
  queueCleared:       ['Queue cleared',                      'कतार साफ़ हो गई'],
  syncedCount:        ['Synced {sent}',                      '{sent} भेजे'],
  syncedCountFailed:  ['Synced {sent}, {failed} failed',     '{sent} भेजे, {failed} विफल'],
  syncFailedConn:     ['Sync failed — check connection',     'सिंक विफल — कनेक्शन जाँचें'],
  itemsWaiting:       ['{count} items waiting',              '{count} सामान बाकी'],
  nFailed:            ['{count} failed',                     '{count} विफल'],
  lastSync:           ['Last sync: {time}',                  'आखिरी सिंक: {time}'],
  nAttempts:          ['{count} attempts',                   '{count} कोशिशें'],
  // Outbox row descriptions
  descReceived:       ['Received {qty}× {name}',             '{qty}× {name} मिला'],
  descNewProduct:     ['New product: {name}',                'नया सामान: {name}'],
  descDispensed:      ['Dispensed {qty}× {name}',            '{qty}× {name} दिया'],
  descReorder:        ['Reorder: {name}',                    'दोबारा ऑर्डर: {name}'],
  descMismatch:       ['Mismatch: {received} vs {expected} expected', 'फ़र्क: {received} बनाम {expected} अपेक्षित'],
  descInventoryUpdate:['Inventory update',                   'इन्वेंटरी अपडेट'],
  // Relative time
  justNow:            ['Just now',                           'अभी'],
  minAgo:             ['{n} min ago',                        '{n} मिनट पहले'],
  hourAgo:            ['{n}h ago',                            '{n} घंटे पहले'],
  dayAgo:             ['{n}d ago',                            '{n} दिन पहले'],

  // Receiving — shelf-life quick pick (label only; months value is kept)
  shelf3mo:           ['3 mo',                               '3 माह'],
  shelf6mo:           ['6 mo',                               '6 माह'],
  shelf1yr:           ['1 yr',                               '1 साल'],
  shelf2yr:           ['2 yr',                               '2 साल'],

  // Batch editor
  expires:            ['Expires',                            'एक्सपायरी'],
  pickExpiry:         ['Pick expiry',                        'एक्सपायरी चुनें'],
  tapToPickDate:      ['Tap to pick a date instead',         'इसके बजाय तारीख चुनें'],

  // Register product — categories (label only; canonical value is stored)
  catGrocery:         ['Grocery',                            'किराना'],
  catOffice:          ['Office',                             'ऑफिस'],
  catCafeteria:       ['Cafeteria',                          'कैफेटेरिया'],
  catOther:           ['Other',                              'अन्य'],
  // Register product — units (label only; canonical value is stored)
  unitPcs:            ['pcs',                                'पीस'],
  unitPackShort:      ['pack',                               'पैक'],
  // Register product — tracking mode
  trackingMode:       ['Tracking mode',                      'ट्रैकिंग मोड'],
  wholePacks:         ['Whole packs ({size} {unit}/pack)',   'पूरे पैक ({size} {unit}/पैक)'],
  divisibleMode:      ['Divisible (decimal {unit})',         'विभाज्य (दशमलव {unit})'],
  dispenseFractionalHint: ['Dispense will accept fractional {unit} (e.g. 1.5 {unit}).', 'वितरण में आंशिक {unit} चलेगा (जैसे 1.5 {unit})।'],
  dispenseWholeHint:  ['Dispense will be whole packs only (1, 2, 3…).', 'वितरण सिर्फ़ पूरे पैक में होगा (1, 2, 3…)।'],

  // Relative expiry phrases (the date itself stays locale-neutral)
  expiresToday:       ['expires today',                      'आज एक्सपायर'],
  expiresTomorrow:    ['expires tomorrow',                   'कल एक्सपायर'],
  expiredYesterday:   ['expired yesterday',                  'कल एक्सपायर हुआ'],
  expiresInDays:      ['in {n} days',                        '{n} दिन में'],
  expiresInWeeks:     ['in {n} weeks',                       '{n} हफ़्ते में'],
  expiresInMonths:    ['in {n} months',                      '{n} महीने में'],
  expiresInYears:     ['in {n} years',                       '{n} साल में'],
  expiredDaysAgo:     ['expired {n} days ago',               '{n} दिन पहले एक्सपायर'],
  expiredWeeksAgo:    ['expired {n} weeks ago',              '{n} हफ़्ते पहले एक्सपायर'],
  expiredMonthsAgo:   ['expired {n} months ago',             '{n} महीने पहले एक्सपायर'],
  expiredYearsAgo:    ['expired {n} years ago',              '{n} साल पहले एक्सपायर'],
  // Order session batch summary
  expShort:           ['Exp: {date}',                        'एक्स.: {date}'],
  expiriesEarliest:   ['{count} expiries (earliest {date})', '{count} एक्सपायरी (सबसे पहले {date})'],

  // Scanner
  scanBarcode:        ['Scan barcode',                       'बारकोड स्कैन करें'],
  holdSteadyHint:     ['Hold the barcode steady for a moment.', 'बारकोड को थोड़ी देर स्थिर रखें।'],
  noBarcode:          ['No barcode',                         'बारकोड नहीं है'],
  typeBarcode:        ['Type the barcode',                   'बारकोड टाइप करें'],
  damagedLabelHint:   ["Use this when the label is damaged or won't scan.", 'जब लेबल खराब हो या स्कैन न हो तब इसका उपयोग करें।'],
} as const satisfies Record<string, Pair>;

export type StringKey = keyof typeof STR;

/** Values interpolated into a translated string's `{token}` placeholders. */
export type TParams = Record<string, string | number>;

export function translate(key: StringKey, lang: Lang, params?: TParams): string {
  const entry = STR[key];
  if (!entry) return key;
  let out: string = lang === 'hi' ? entry[1] : entry[0];
  if (params) {
    // Translate the frame, interpolate the data: replace {token} with the
    // caller's value. Dynamic bits (names, counts) are data, not words to
    // translate — keep them out of the string table.
    out = out.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
  }
  return out;
}
