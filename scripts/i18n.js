/**
 * Voon.fi Asiakaspalvelu Chatbot — Suomenkieliset käännökset
 * Finnish customer service translations
 */

export const fi = {
  // Header
  header: {
    title: 'Voon Asiakaspalvelu',
    subtitle: 'Tekoälyavustaja',
    status_online: 'Verkossa',
    status_offline: 'Offline',
    status_connecting: 'Yhdistetään...',
  },

  // Welcome
  welcome: {
    greeting: 'Hei! Olen Voon virtuaaliassistentti.',
    intro: 'Autan sinua mielellään tilausten, laskutuksen, teknisten ongelmien ja muiden kysymysten kanssa. Miten voin auttaa tänään?',
    quick_actions: 'Suositut aiheet:',
  },

  // Quick action buttons
  quick_actions: {
    order_status: 'Tilauksen tila',
    billing: 'Laskutus ja maksut',
    technical: 'Tekninen tuki',
    account: 'Tilin hallinta',
    cancel: 'Peru tilaus',
    contact_human: 'Puhu ihmiselle',
  },

  // Input
  input: {
    placeholder: 'Kirjoita viestisi...',
    placeholder_voice: 'Kuuntelee...',
    send: 'Lähetä',
    attach: 'Liitä tiedosto',
    voice_start: 'Aloita äänisyöte',
    voice_stop: 'Lopeta äänisyöte',
  },

  // Voice
  voice: {
    listening: 'Kuuntelee...',
    processing: 'Käsitellään...',
    speak_now: 'Puhu nyt',
    error_no_mic: 'Mikrofoni ei ole käytettävissä. Tarkista selaimesi luvat.',
    error_no_support: 'Selaimesi ei tue puheentunnistusta.',
    read_aloud: 'Lue ääneen',
    stop_reading: 'Lopeta lukeminen',
    voice_enabled: 'Ääni käytössä',
    voice_disabled: 'Ääni pois',
  },

  // Chat states
  states: {
    typing: 'Kirjoittaa...',
    thinking: 'Miettii...',
    connecting: 'Yhdistetään tekoälyyn...',
    error_generic: 'Jokin meni pieleen. Yritä uudelleen.',
    error_network: 'Yhteysvirhe. Tarkista internet-yhteytesi.',
    error_api: 'Palvelu on tilapäisesti poissa käytöstä. Yritä hetken kuluttua uudelleen.',
    session_timeout: 'Istuntosi on vanhentunut. Ladataan uudelleen...',
  },

  // Agent handoff
  handoff: {
    title: 'Yhdistetään asiakaspalvelujaan',
    message: 'Yhdistän sinut nyt ihmisasiakaspalvelijaan. Odotusaika on noin {time} minuuttia.',
    queue_position: 'Olet jonossa sijalla {position}.',
    agent_joined: '{agent} liittyi keskusteluun.',
    agent_left: 'Asiakaspalvelija poistui. Voin jatkaa auttamistasi.',
    leave_message: 'Kaikki asiakaspalvelijat ovat varattuja. Jätä viestisi ja palaamme sinulle pian.',
    email_placeholder: 'Sähköpostiosoitteesi',
    name_placeholder: 'Nimesi',
    submit: 'Lähetä viesti',
    submitted: 'Viestisi on lähetetty! Otamme yhteyttä 24 tunnin sisällä.',
    cancel: 'Peruuta',
  },

  // Satisfaction
  satisfaction: {
    question: 'Kuinka arvioisit tämän keskustelun?',
    terrible: 'Erittäin huono',
    bad: 'Huono',
    ok: 'Ok',
    good: 'Hyvä',
    excellent: 'Erinomainen',
    submitted: 'Kiitos palautteestasi!',
    comment_placeholder: 'Lisäkommentit (valinnainen)...',
    submit: 'Lähetä arvio',
  },

  // File upload
  upload: {
    drag_drop: 'Vedä ja pudota tai klikkaa lisätäksesi liitteen',
    max_size: 'Maksimikoko: 10 MB',
    uploading: 'Ladataan...',
    success: 'Tiedosto ladattu',
    error_size: 'Tiedosto on liian suuri (max 10 MB)',
    error_type: 'Tiedostotyyppi ei ole tuettu',
    types_allowed: 'Sallitut tyypit: JPG, PNG, PDF, DOC, DOCX',
  },

  // Notifications
  notifications: {
    new_message: 'Uusi viesti Voon asiakaspalvelusta',
    copied: 'Kopioitu leikepöydälle',
    session_saved: 'Keskustelu tallennettu',
  },

  // Buttons
  buttons: {
    copy: 'Kopioi',
    thumbs_up: 'Hyödyllinen',
    thumbs_down: 'Ei hyödyllinen',
    retry: 'Yritä uudelleen',
    new_chat: 'Uusi keskustelu',
    close: 'Sulje',
    minimize: 'Pienennä',
    expand: 'Laajenna',
    download: 'Lataa',
    print: 'Tulosta',
    share: 'Jaa',
  },

  // System messages
  system: {
    chat_started: 'Keskustelu aloitettu',
    chat_ended: 'Keskustelu päättyi',
    date_today: 'Tänään',
    date_yesterday: 'Eilen',
  },

  // Fallback / escalation
  fallback: {
    not_understand: 'En täysin ymmärtänyt kysymystäsi. Voisitko tarkentaa?',
    suggest_contact: 'Tämä asia vaatii asiantuntija-apua. Yhdistän sinut asiakaspalvelijaan.',
    faq_suggestion: 'Löydät vastauksen myös usein kysytyistä kysymyksistä:',
    no_answer: 'Minulla ei ole vastausta tähän kysymykseen, mutta voin välittää sen tiimillemme.',
  },

  // Ticket creation
  ticket: {
    created: 'Tukipyyntö #{id} luotu onnistuneesti.',
    followup: 'Saat vahvistuksen sähköpostitse ja palaamme sinulle 24 tunnin sisällä.',
    priority_low: 'Matala prioriteetti',
    priority_medium: 'Normaali prioriteetti',
    priority_high: 'Korkea prioriteetti',
    priority_urgent: 'Kiireellinen',
  },

  // Time
  time: {
    just_now: 'juuri nyt',
    minutes_ago: '{n} min sitten',
    hour_ago: '1 tunti sitten',
    hours_ago: '{n} tuntia sitten',
  },
};

export default fi;
