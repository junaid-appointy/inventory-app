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
  syncQueue:       ['Not sent yet',       'अभी नहीं भेजा'],
  syncQueueSub:    ['Things saved on this phone', 'इस फ़ोन में सेव चीज़ें'],
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
  // Sync copy. Silence is the normal state; the second line only turns
  // urgent when something genuinely needs a person.
  syncAllClear:    ['Everything is saved', 'सब कुछ सेव है'],
  syncNeedsAttention: ['{n} need your attention', '{n} पर ध्यान दें'],
  statusAdjusted:  ['Adjusted',           'समायोजित'],
  statusCounted:   ['In count',           'गिनती में'],
  // Access (roles). Shown when the server says this person may not do
  // something, or has no apps at all.
  statusNotAllowed:   ['Not allowed', 'अनुमति नहीं'],
  rejectedHelp:       ['You do not have permission for this. Ask your supervisor, then tap Sync now.', 'आपको इसकी अनुमति नहीं है। सुपरवाइज़र से पूछें, फिर "अभी भेजें" दबाएँ।'],
  noAccessTitle:      ['No apps yet', 'अभी कोई ऐप नहीं'],
  noAccessBody:       ['Your account has no access yet. Ask your admin to give you access.', 'आपके खाते को अभी एक्सेस नहीं मिला है। अपने एडमिन से एक्सेस माँगें।'],
  checkAgain:         ['Check again', 'फिर से देखें'],
  noPermissionScreen: ['You do not have permission for this. Ask your supervisor.', 'आपको इसकी अनुमति नहीं है। अपने सुपरवाइज़र से पूछें।'],
  needSupervisorNewItem: ['New items can only be added by a supervisor. Pick an item from the list.', 'नया सामान सिर्फ़ सुपरवाइज़र जोड़ सकते हैं। सूची से सामान चुनें।'],
  themeLight:      ['Light',              'उजला'],
  themeDark:       ['Dark',               'अंधेरा'],

  // Filter labels
  filterCategory:  ['Category',           'श्रेणी'],
  filterStatus:    ['Status',             'स्थिति'],

  // Receiving / scanning actions
  tapToSelectDate: ['Tap to select date', 'तारीख चुनें'],
  addToOrder:      ['Add to delivery',    'डिलीवरी में जोड़ें'],
  scanNextItem:    ['Scan next',          'अगला स्कैन'],
  cancelOrder:     ['Cancel delivery',    'डिलीवरी रद्द'],

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
  partlyReceived:  ['Partly received',    'कुछ सामान आ गया'],
  receivedOfTotal: ['{done} of {total} received', '{total} में से {done} आया'],
  showMoreItems:   ['Show {n} more',      '{n} और देखें'],
  showFewerItems:  ['Show less',          'कम दिखाएँ'],
  billDated:       ['Bill of {date}',     '{date} का बिल'],
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
  submitOrder:     ['Finish delivery',    'डिलीवरी पूरी करें'],

  // Login
  guardName:       ['Your name',          'आपका नाम'],
  guardNameHint:   ['As registered by your supervisor', 'आपके सुपरवाइज़र ने जो लिखा'],
  cameraHint:      ['We use the camera only to read barcodes — no photos are taken.', 'कैमरा सिर्फ़ बारकोड पढ़ने के लिए — कोई फ़ोटो नहीं।'],

  // Login form extras
  pin:             ['PIN',                'पिन'],
  pinHint:         ['6 digits',           '6 अंक'],
  select:          ['Select',             'चुनें'],
  signInWithPin:   ['Sign in with your name and PIN.', 'अपने नाम और पिन से लॉग इन करें।'],
  signingIn:       ['Signing in…',        'लॉग-इन हो रहा…'],
  fillDetailsError:['Please enter your name and your 6 digit PIN.', 'कृपया अपना नाम और 6 अंकों का पिन दर्ज करें।'],

  // Placeholders
  productExample:  ['e.g. Tata Salt 1kg', 'जैसे टाटा नमक 1kg'],
  barcodeExample:  ['e.g. 8901030875021', 'जैसे 8901030875021'],

  // Catalog picker / search
  pickProduct:        ['Pick product',                       'सामान चुनें'],
  itemsInCatalog:     ['items in catalog',                   'कैटलॉग में'],
  itemInCatalog:      ['item in catalog',                    'कैटलॉग में'],
  searchPlaceholder:  ['Type product name, category or HSN…','सामान का नाम, श्रेणी या HSN टाइप करें…'],
  searchingCatalog:   ['Checking…',                          'देख रहे हैं…'],
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

  // Smart Stock Card actions
  used:               ['Used',                                 'खर्च'],
  received:           ['Received',                             'मिला'],

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
  offlineBanner:      ['Offline. Showing saved data',           'ऑफ़लाइन। सेव किया हुआ दिखा रहे हैं'],
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
  // Stock list summary + sorting
  totalItems:         ['Total items',                        'कुल सामान'],
  leftOfStocked:      ['of {amount} stocked',                '{amount} में से'],
  sortBy:             ['Sort',                               'क्रम'],
  sortNameAsc:        ['Name A-Z',                           'नाम A-Z'],
  sortLowestFirst:    ['Lowest stock first',                 'कम स्टॉक पहले'],
  sortExpiringFirst:  ['Expiring soonest',                   'जल्दी एक्सपायर'],
  sortRecentlyUpdated:['Recently updated',                   'हाल में अपडेट'],

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
  removeItemBody:     ['Remove "{name}" from this delivery?', '"{name}" को इस डिलीवरी से हटाएँ?'],
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
  // Batch picker / batch editor denomination hints. These tell the user
  // what the numbers on screen are counting, so they follow whichever
  // mode the dispense stepper is in.
  // Stocktake framing. A count is recorded, never negotiated — there is
  // no string here that asks the user to pick between two numbers.
  recordCount:        ['Record count',                       'गिनती दर्ज करें'],
  systemShows:        ['System shows {amount}. Your count is what gets recorded.',
                       'सिस्टम में {amount} है। आपकी गिनती ही दर्ज होगी।'],
  onePackEquals:      ['1 pack = {size} {unit}',             '1 पैक = {size} {unit}'],
  countingInPacks:    ['Counting in packs',                  'पैक में गिनती'],
  countingInUnit:     ['Counting in {unit}',                 '{unit} में गिनती'],

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

  // ── Super app launcher ──
  launcherTitle:      ['What do you want to do?', 'आप क्या करना चाहते हैं?'],
  moduleInventory:    ['Inventory', 'सामान'],
  moduleInventorySub: ['Stock, deliveries, take out items', 'स्टॉक, डिलीवरी, सामान निकालना'],
  moduleVisitor:      ['Visitor gate', 'विज़िटर गेट'],
  moduleVisitorSub:   ['Scan passes, walk-ins, who is inside', 'पास स्कैन, बिना पास वाले, कौन अंदर है'],

  // ── Visitor gate: home ──
  scanPass:           ['Scan visitor pass', 'विज़िटर पास स्कैन करें'],
  scanPassSub:        ['Point the camera at the QR code', 'कैमरा को QR कोड पर रखें'],
  onSite:             ['Inside now', 'अभी अंदर'],
  onSiteSub:          ['Mark exit when they leave', 'जाते समय बाहर दर्ज करें'],
  gateExpected:       ['Expected today', 'आज आने वाले'],
  gateExpectedSub:    ['Guests with a pass for today', 'आज के पास वाले मिलनेवाले'],
  walkIn:             ['Walk-in', 'बिना पास'],
  walkInSub:          ['Visitor without a pass', 'बिना पास वाला मिलनेवाला'],
  staffInOut:         ['Staff in or out', 'स्टाफ अंदर या बाहर'],
  staffInOutSub:      ['Mark employees in and out', 'कर्मचारियों को अंदर या बाहर दर्ज करें'],
  gatePendingSync:    ['{n} saved offline. They will send when online.', '{n} ऑफ़लाइन सेव। इंटरनेट आने पर भेजे जाएंगे।'],

  // ── Visitor gate: pass result ──
  checkingPass:       ['Checking pass', 'पास जाँच रहे हैं'],
  checkingIn:         ['Checking in', 'अंदर दर्ज हो रहा है'],
  passApproved:       ['Approved', 'मंज़ूर'],
  passPending:        ['Waiting for host approval', 'मंज़ूरी बाकी है'],
  passRejected:       ['Not allowed', 'नहीं आने दिया'],
  passExpired:        ['Pass expired', 'समय खत्म'],
  passAlreadyUsed:    ['Already scanned', 'पहले ही स्कैन हो चुका'],
  passNotFound:       ['Pass not found', 'QR नहीं मिला'],
  passCancelled:      ['Visit cancelled', 'विज़िट रद्द'],
  passNotYetValid:    ['Pass starts later', 'बाद में शुरू होगा'],
  checkedInDone:      ['Checked in', 'अंदर हो गया'],
  alreadyInside:      ['Already checked in', 'पहले ही अंदर दर्ज है'],
  checkInNow:         ['Check in', 'अंदर करें'],
  scanNext:           ['Scan next', 'अगला स्कैन करें'],
  offlineCapture:     ['No internet. Save this check-in now and it will be checked later.', 'इंटरनेट नहीं है। यह चेक-इन अभी सेव करें, बाद में जाँचा जाएगा।'],
  saveCheckIn:        ['Save check-in', 'चेक-इन सेव करें'],
  savedForLater:      ['Saved. It will send when online.', 'सेव हुआ। इंटरनेट आने पर भेजा जाएगा।'],
  visitorLabel:       ['Visitor', 'मिलनेवाले'],
  hostLabel:          ['Host', 'होस्ट'],
  purposeLabel:       ['Purpose', 'काम'],
  phoneLabel:         ['Phone', 'मोबाइल'],
  validUntilLabel:    ['Valid until', 'तक मान्य'],
  somethingWrong:     ['Something went wrong. Try again.', 'कुछ गड़बड़ हुई। फिर से कोशिश करें।'],

  // ── Visitor gate: inside now ──
  searchVisitors:     ['Search visitor, host or purpose', 'मिलनेवाले, होस्ट या काम खोजें'],
  nobodyInside:       ['Nobody inside right now', 'अभी कोई नहीं है'],
  markExit:           ['Mark exit', 'बाहर किया'],
  exitConfirmTitle:   ['Has {name} left?', 'क्या {name} बाहर गए?'],
  yesLeft:            ['Yes, left', 'हाँ, गए'],
  exitDone:           ['{name} marked out', '{name} बाहर दर्ज'],
  insideFor:          ['Inside for {time}', '{time} से अंदर'],
  minutesShort:       ['{n} min', '{n} मिनट'],
  hoursShort:         ['{h} h {m} min', '{h} घंटे {m} मिनट'],
  loadFailed:         ['Could not load. Pull down to try again.', 'लोड नहीं हुआ। फिर से कोशिश करने के लिए नीचे खींचें।'],

  // ── Visitor gate: walk-in ──
  visitorNameField:   ['Visitor name', 'मिलनेवाले का नाम'],
  phoneOptional:      ['Phone (optional)', 'मोबाइल (ज़रूरी नहीं)'],
  purposeMeeting:     ['Meeting', 'मीटिंग'],
  purposeInterview:   ['Interview', 'इंटरव्यू'],
  purposeDelivery:    ['Delivery', 'डिलीवरी'],
  purposeOther:       ['Other', 'अन्य'],
  purposeDetails:     ['What is the visit for?', 'विज़िट किस लिए है?'],
  hostField:          ['Who are they meeting?', 'किससे मिलने आए हैं?'],
  hostSearchHint:     ['Type 2 letters to search', 'खोजने के लिए 2 अक्षर लिखें'],
  needVisitorName:    ['Enter the visitor name', 'मिलनेवाले का नाम भरें'],
  needPurpose:        ['Enter the visit purpose', 'विज़िट का कारण भरें'],
  needHost:           ['Pick who they are meeting', 'होस्ट चुनें'],
  walkInDone:         ['{name} checked in', '{name} अंदर हो गए'],

  // ── Visitor gate: expected ──
  searchExpected:     ['Search name, host or phone', 'नाम, होस्ट या मोबाइल खोजें'],
  noExpected:         ['No guests expected today', 'आज के लिए कोई अपेक्षित मिलनेवाले नहीं'],
  expectedSavedAt:    ['List saved at {time}', 'सूची {time} पर सेव हुई'],
  expectedOffline:    ['Offline. Showing the saved list.', 'ऑफ़लाइन। सेव की गई सूची दिख रही है।'],
  statusInside:       ['Inside', 'अंदर'],

  // ── Visitor gate: staff ──
  searchStaff:        ['Search name or employee code', 'नाम या कर्मचारी कोड खोजें'],
  markIn:             ['Mark in', 'अंदर दर्ज करें'],
  markOut:            ['Mark out', 'बाहर दर्ज करें'],
  markedIn:           ['{name} marked in', '{name} अंदर दर्ज'],
  markedOut:          ['{name} marked out', '{name} बाहर दर्ज'],
  staffAll:           ['All', 'सभी'],
  staffInside:        ['Inside', 'अंदर'],
  staffNotInside:     ['Not inside', 'अंदर नहीं'],
  staffNoneInside:    ['No staff are marked inside.', 'कोई स्टाफ अंदर दर्ज नहीं है।'],
  staffNoneOutside:   ['Everyone is marked inside.', 'सभी स्टाफ अंदर दर्ज हैं।'],
  staffSearchEveryone:['Search includes everyone. Clear it to use the filters.', 'खोज में सभी शामिल हैं। फ़िल्टर के लिए खोज साफ़ करें।'],
  staffStatusUnavailable: ['Server unavailable. Last known status is shown. New entries are saved on this device.', 'सर्वर उपलब्ध नहीं है। अंतिम ज्ञात स्थिति दिखाई गई है। नई एंट्री इस डिवाइस पर सहेजी जाती हैं।'],
  unsentHelp:         ['Saved on this phone. Send them on WhatsApp so the office knows.', 'यह इस फ़ोन में सेव है। WhatsApp पर भेजें ताकि ऑफ़िस को पता चले।'],
  sendOnWhatsapp:     ['Send on WhatsApp ({n})', 'WhatsApp पर भेजें ({n})'],
  sentOnWhatsapp:     ['Sent on WhatsApp', 'WhatsApp पर भेजा'],
  unsentBanner:       ['{n} not sent. Tap to send on WhatsApp', '{n} नहीं गए। WhatsApp पर भेजने के लिए दबाएँ'],
  savedWithNote:      ['Saved, with a note', 'सेव हुआ, एक नोट के साथ'],
  photoSendsItself:   ['Photo. It sends by itself later.', 'फ़ोटो। बाद में अपने आप जाएगी।'],
  rejectedShort:      ['Not allowed. Ask your supervisor', 'अनुमति नहीं। सुपरवाइज़र से पूछें'],
  removeNotAllowed:   ['Remove the ones not allowed', 'जिनकी अनुमति नहीं, उन्हें हटाएँ'],
  shareHeader:        ['Office update. The app could not reach the server.', 'ऑफ़िस अपडेट। ऐप सर्वर से नहीं जुड़ पाया।'],
  shareFooter:        ['Saved on the phone. It goes into the system when the internet is back.', 'फ़ोन में सेव है। इंटरनेट आने पर सिस्टम में चला जाएगा।'],
  descStaffIn:        ['Staff in: {name}', 'स्टाफ अंदर: {name}'],
  descStaffOut:       ['Staff out: {name}', 'स्टाफ बाहर: {name}'],
  descToMeet:         ['to meet {name}', '{name} से मिलने'],
  noStaffFound:       ['No staff found', 'कोई स्टाफ नहीं मिला'],
  needsInternet:      ['This needs internet. Try again when online.', 'इसके लिए इंटरनेट चाहिए। ऑनलाइन होने पर फिर कोशिश करें।'],
  inAt:               ['In {time}', 'अंदर {time}'],
  outAt:              ['Out {time}', 'बाहर {time}'],

  // ── Sync queue rows for gate actions ──
  descVisitorCheckIn: ['Visitor check-in: {name}', 'विज़िटर चेक-इन: {name}'],
  descVisitorWalkIn:  ['Walk-in: {name}', 'बिना पास: {name}'],
  descVisitorExit:    ['Visitor exit: {name}', 'विज़िटर बाहर: {name}'],

  // ── App shell (hub screens + bottom bar) ──
  goodMorning:        ['Good morning', 'सुप्रभात'],
  goodAfternoon:      ['Good afternoon', 'नमस्ते'],
  goodEvening:        ['Good evening', 'शुभ संध्या'],
  tabToday:           ['Today', 'आज'],
  tabInventory:       ['Inventory', 'सामान'],
  tabVisitors:        ['Visitors', 'मिलनेवाले'],
  tabScan:            ['Scan', 'स्कैन'],
  tabMore:            ['More', 'और'],
  syncAllGood:        ['All synced', 'सब सिंक है'],
  syncWaiting:        ['{n} to send', '{n} भेजना बाकी'],
  syncOfflineChip:    ['Offline', 'ऑफ़लाइन'],
  syncProblemChip:    ['{n} need you', '{n} पर ध्यान दें'],
  todayAtGlance:      ['Today at a glance', 'आज एक नज़र में'],
  quickActions:       ['Quick actions', 'जल्दी के काम'],
  comingToday:        ['Coming today', 'आज आने वाले'],
  needsAttention:     ['Needs attention', 'ध्यान दें'],
  allClear:           ['All clear. Nothing needs you right now.', 'सब ठीक है। अभी कुछ बाकी नहीं।'],
  viewAll:            ['View all', 'सब देखें'],
  statExpected:       ['expected', 'आने वाले'],
  statInside:         ['inside', 'अंदर'],
  statLow:            ['low stock', 'कम स्टॉक'],
  statOut:            ['out', 'खत्म'],
  statInStock:        ['in stock', 'स्टॉक में'],
  statToSend:         ['to send', 'भेजना बाकी'],
  outOfStock:         ['Out of stock', 'खत्म'],
  inStockChip:        ['In stock', 'स्टॉक में'],
  lowChip:            ['Low', 'कम'],
  qtyLeft:            ['{qty} {unit} left', '{qty} {unit} बचे'],
  scanItemAction:     ['Scan item', 'सामान स्कैन करें'],
  receiveAction:      ['Receive delivery', 'डिलीवरी लें'],
  takeOutAction:      ['Take out', 'सामान निकालें'],
  allItems:           ['All items', 'सारा सामान'],
  allItemsSub:        ['Counts, expiry and shelf', 'गिनती, एक्सपायरी और शेल्फ़'],
  deliveriesSub:      ['Orders waiting to arrive', 'आने वाले ऑर्डर'],
  writesNotSent:      ['{n} saved items could not send', '{n} सेव किए गए काम नहीं भेजे जा सके'],
  scanAnything:       ['Scan a pass or an item', 'पास या सामान स्कैन करें'],
  scanAnythingSub:    ['Visitor QR or product barcode', 'विज़िटर QR या सामान का बारकोड'],
  notAllowedScan:     ['You cannot use this code here', 'यह कोड आप यहाँ इस्तेमाल नहीं कर सकते'],
  moreTitle:          ['More', 'और'],
  viewAction:         ['View', 'देखें'],
  itemsNeedAttention: ['{n} items need attention', '{n} चीज़ों पर ध्यान दें'],
  itemNeedsAttention: ['1 item needs attention', '1 चीज़ पर ध्यान दें'],
  updateReady:        ['A new version is ready', 'नया वर्ज़न तैयार है'],
  updateRestart:      ['Restart', 'चालू करें'],
  updateCheck:        ['Check for updates', 'अपडेट देखें'],
  updateChecking:     ['Checking…', 'देख रहे हैं…'],
  updateLatest:       ['You have the latest version', 'सबसे नया वर्ज़न है'],
  updateDownloaded:   ['New version downloaded. Tap Restart at the top.', 'नया वर्ज़न आ गया। ऊपर चालू करें दबाएँ।'],
  updateOffline:      ['Could not check. Is the internet on?', 'जाँच नहीं हो सकी। इंटरनेट चालू है?'],
  updateDevBuild:     ['Test build: updates come from the dev server', 'टेस्ट बिल्ड: अपडेट डेव सर्वर से आते हैं'],
  appVersion:         ['Version {v}', 'वर्ज़न {v}'],
  searchItem:         ['Search item', 'सामान खोजें'],
  seeAllItems:        ['See all items', 'सारा सामान देखें'],
  expectedNow:        ['Expected today', 'आज आने वाले'],
  walkInCheckIn:      ['Walk-in check-in', 'बिना पास वाले को अंदर करें'],
  checkInVisitor:     ['Check in visitor', 'मिलनेवाले को अंदर करें'],
  scanAction:         ['Scan', 'स्कैन करें'],
  insideNowCount:     ['Inside now · {n}', 'अभी अंदर · {n}'],
  // ── Sign in ──
  pinBoxesHint:       ['6 digits', '6 अंक'],
  wrongNameOrPin:     ['That name and PIN do not match. Try again, or ask your supervisor.', 'नाम और पिन मेल नहीं खाते। फिर से कोशिश करें या अपने सुपरवाइज़र से पूछें।'],
  cannotReachServer:  ['Cannot reach the server. Check the internet and try again.', 'सर्वर तक नहीं पहुँच पा रहे। इंटरनेट देखें और फिर कोशिश करें।'],
  tooManyTries:       ['Too many tries. Wait a few minutes and try again.', 'बहुत बार कोशिश हुई। कुछ मिनट रुककर फिर कोशिश करें।'],
  // ── Inventory list ──
  filterAll:          ['All', 'सब'],
  filterExpiring:     ['Expiring soon', 'जल्द एक्सपायर'],
  shelfLabel:         ['Shelf', 'शेल्फ़'],
  expiryLabel:        ['Expiry', 'एक्सपायरी'],
  updatedLabel:       ['Updated', 'अपडेट'],
  correctCount:       ['Correct count', 'गिनती ठीक करें'],
  receiveShort:       ['Receive', 'सामान लें'],
  ofLastRestock:      ['{left} of {stocked} left since last restock', 'पिछली भराई के {stocked} में से {left} बचे'],
  allItemsTitle:      ['All items', 'सारा सामान'],
  // ── Receive / delivery ──
  howManyPacks:       ['How many packs arrived?', 'कितने पैक आए?'],
  packsWord:          ['packs', 'पैक'],
  expiryDateTitle:    ['Expiry date', 'एक्सपायरी तारीख'],
  differentExpiries:  ['Packs have different expiry dates?', 'अलग-अलग एक्सपायरी वाले पैक?'],
  sameExpiry:         ['All packs have the same date', 'सभी पैक की एक ही तारीख'],
  onOrderTitle:       ['On order', 'ऑर्डर में'],
  receivedOfExpected: ['{received} of {expected} after this', 'इसके बाद {expected} में से {received}'],
  overOrderedBy:      ['{n} more than ordered', 'ऑर्डर से {n} ज़्यादा'],
  notOnOrder:         ['Not on any open order', 'किसी खुले ऑर्डर में नहीं'],
  changeAction:       ['Change', 'बदलें'],
  thisDelivery:       ['This delivery', 'यह डिलीवरी'],
  deliveryCount:      ['{items} items · {packs} packs', '{items} सामान · {packs} पैक'],
  deliveryEmptyHint:  ['Scan the first item to start.', 'शुरू करने के लिए पहला सामान स्कैन करें।'],
  finishShort:        ['Finish ({n})', 'पूरा करें ({n})'],
  deliverySaved:      ['Delivery saved', 'डिलीवरी सेव हुई'],
  addAnotherDate:     ['Add another date', 'एक और तारीख जोड़ें'],
  pickDateShort:      ['Pick date', 'तारीख चुनें'],
  noDateShort:        ['No date', 'तारीख नहीं'],
  differentDatesTitle:['Packs with different dates', 'अलग तारीख वाले पैक'],
  // ── Take out ──
  howManyTaking:      ['How many are you taking?', 'कितने ले रहे हैं?'],
  inStoreAmount:      ['{amount} in store', 'स्टोर में {amount}'],
  leftAfterThis:      ['Left after this: {amount}', 'इसके बाद बचेगा: {amount}'],
  useOldestFirst:     ['Use the oldest first', 'पुराना पहले इस्तेमाल करें'],
  useFirstBadge:      ['Use first', 'पहले यह'],
  nLeft:              ['{n} left', '{n} बचे'],
  whatIsItFor:        ['What is it for?', 'किस काम के लिए?'],
  takenByName:        ['Taken by {name}', '{name} ने लिया'],
  takeOutAmount:      ['Take out {amount}', '{amount} निकालें'],
  checkingCount:      ['Checking the latest count', 'नई गिनती देख रहे हैं'],
  whichItem:          ['Which item?', 'कौन सा सामान?'],
  itemsSection:       ['Items', 'सामान'],
  seeAllCount:        ['See all {n}', 'सब {n} देखें'],
  nDeliveriesExpected:['{n} expected', '{n} आने वाली'],
  tabScanItem:        ['Scan item', 'सामान स्कैन'],
  tabScanPass:        ['Scan pass', 'पास स्कैन'],
  // ── Shelf pictures (closed packs + one open pack) ──
  takenFromOldest:    ['Taken from the oldest first', 'सबसे पुराने से लिया जाएगा'],
  onTheShelf:         ['On the shelf', 'शेल्फ़ पर'],
  inYourHand:         ['In your hand', 'आपके हाथ में'],
  goesInHand:         ['goes in your hand', 'आपके हाथ में जाएगा'],
  shelfEmpty:         ['Shelf is empty', 'शेल्फ़ खाली है'],
  tileOpen:           ['Open pack', 'खुला पैक'],
  tileClosed:         ['Closed pack', 'बंद पैक'],
  tileTakeWhole:      ['Take whole', 'पूरा लें'],
  tileOpenThis:       ['Open this', 'इसे खोलें'],
  tileTake:           ['take {amount}', '{amount} लें'],
  tileLeft:           ['{amount} left', '{amount} बचा'],
  closedPacksTitle:   ['Closed packs', 'बंद पैक'],
  fromOpenPackTitle:  ['From the open pack', 'खुले पैक से'],
  inEachPack:         ['{amount} in each', 'हर एक में {amount}'],
  closedPackOne:      ['closed pack', 'बंद पैक'],
  closedPackMany:     ['closed packs', 'बंद पैक'],
  packOne:            ['pack', 'पैक'],
  packMany:           ['packs', 'पैक'],
  stepPickClosed:     ['Pick up {count}.', '{count} उठाएँ।'],
  stepFromOpen:       ['Take {amount} from the open pack.', 'खुले पैक से {amount} लें।'],
  stepEmptyOpen:      ['Empty the open pack. That is {amount}.', 'खुला पैक खाली करें। यह {amount} है।'],
  stepOpenNew:        ['Open a new pack and take {amount}.', 'नया पैक खोलें और {amount} लें।'],
  tapPlusHint:        ['Tap + for what you are taking.', 'जो ले रहे हैं उसके लिए + दबाएँ।'],
  leftOnShelf:        ['Left on the shelf: {amount}', 'शेल्फ़ पर बचेगा: {amount}'],
  openPackHas:        ['{count}, open pack has {amount}', '{count}, खुले पैक में {amount}'],
  onlyOpenPackHas:    ['Open pack has {amount}', 'खुले पैक में {amount}'],
  stillSealed:        ['still sealed', 'अभी बंद'],
  inOpenPackTitle:    ['In the open pack', 'खुले पैक में'],
  countZeroIfNone:    ['count it, 0 if none', 'गिनें, न हो तो 0'],
  whatYouCounted:     ['What you counted', 'आपने जो गिना'],
  // ── Correct count ──
  fullPacksWord:      ['full packs', 'पूरे पैक'],
  howManyOnShelf:     ['How many are on the shelf?', 'शेल्फ़ पर कितने हैं?'],
  fullPacksOnShelf:   ['Full packs on the shelf', 'शेल्फ़ पर पूरे पैक'],
  openPackLeft:       ['The open pack: how much is left?', 'खुले पैक में कितना बचा है?'],
  openBoxPieces:      ['The open pack: how many are left?', 'खुले पैक में कितने बचे हैं?'],
  totalOnShelf:       ['Total on the shelf', 'शेल्फ़ पर कुल'],
  lessThanApp:        ['{amount} less than the app had', 'ऐप से {amount} कम'],
  moreThanApp:        ['{amount} more than the app had', 'ऐप से {amount} ज़्यादा'],
  appHasAmount:       ['App has {amount}', 'ऐप में {amount}'],
  fillNone:           ['none', 'खाली'],
  fillLittle:         ['little', 'थोड़ा'],
  saveCount:          ['Save count', 'गिनती सेव करें'],
  notAFullPack:       ['Not a full pack?', 'पूरा पैक नहीं है?'],
  howMuchArrived:     ['How much arrived?', 'कितना आया?'],
  countFullPacks:     ['Count full packs instead', 'पूरे पैक गिनें'],
  // ── Item proof photo (all its packs together) ──
  itemPhotoTitle:     ['Photo of these packs', 'इन पैक की फ़ोटो'],
  itemPhotoHint:      ['Put all {amount} together and take one photo. It goes to the office group.', 'सारे {amount} एक साथ रखकर एक फ़ोटो लें। यह ऑफिस ग्रुप में जाएगी।'],
  itemPhotoHintOne:   ['Take one photo of it. It goes to the office group.', 'इसकी एक फ़ोटो लें। यह ऑफिस ग्रुप में जाएगी।'],
  takeItemPhoto:  ['Take photo', 'फ़ोटो लें'],
  retakePhoto:        ['Take again', 'फिर से लें'],
  usePhoto:           ['Use this photo', 'यही फ़ोटो रखें'],
  photoFailed:        ['The photo did not work. Try again.', 'फ़ोटो नहीं आई। फिर से कोशिश करें।'],
  photoFrameHint:     ['Fit all the packs in the picture', 'सारे पैक फ़ोटो में आएँ'],
  descItemPhoto:      ['Item photo', 'सामान की फ़ोटो'],
  photoGoesToGroup:   ['The photos go to the office group.', 'फ़ोटो ऑफिस ग्रुप में जाएंगी।'],
  tickPhone:          ['Waiting to send', 'भेजना बाकी'],
  tickServer:         ['Sent', 'भेज दी'],
  tickPosted:         ['In the office group', 'ऑफिस ग्रुप में'],
  tickFailed:         ['Will try again', 'फिर से कोशिश होगी'],
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
