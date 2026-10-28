import type { enBooking } from "./en-booking"

export const filBooking: Record<keyof typeof enBooking, string> = {
  "booking.progress.details": "Detalye",
  "booking.progress.waiver": "Waiver at kalusugan",
  "booking.progress.payment": "Bayad",

  "booking.kind.adult": "Matanda",
  "booking.kind.child": "Bata",
  "booking.kind.senior": "Senior citizen",
  "booking.kind.pwd": "PWD",
  "booking.kindNote.adult": "6 taong gulang pataas",
  "booking.kindNote.child": "3 hanggang 5 taong gulang",
  "booking.kindNote.senior": "60 taong gulang pataas · 20% diskwentong itinakda ng batas",
  "booking.kindNote.pwd": "Taong may kapansanan · 20% diskwentong itinakda ng batas",

  "booking.stepper.fewer": "Bawasan ang {label}",
  "booking.stepper.more": "Dagdagan ang {label}",
  "booking.mix.each": "{price} bawat isa · {note}",
  "booking.mix.footnote":
    "Libre ang pasok ng mga batang 2 taong gulang pababa at hindi sila binibilang. Ang diskwento ng senior citizen at PWD ay bine-verify gamit ang valid ID sa gate; ang 20% ay ibinabawas sa singil ng matanda.",

  "booking.addons.none": "Walang available na add-on sa ngayon.",
  "booking.addons.soldOut": "Puno na para sa petsang ito",
  "booking.addons.available": "{left} sa {cap} ang available",
  "booking.addons.deposit": "Maibabalik na deposito na {amount} bawat isa, babayaran sa counter",
  "booking.addons.quantity": "Dami",

  "booking.bill.roomBase": "Batayang singil sa kuwarto",
  "booking.bill.roomExcess": "Bisitang lampas sa 6 (₱250 bawat isa)",
  "booking.bill.pavilion": "Upa sa pavilion sa loob ng apat na oras",
  "booking.bill.poolAccess": "Pasok sa swimming pool",
  "booking.bill.notIncluded": "Hindi kasama",
  "booking.bill.corkage": "Corkage para sa panlabas na supplier",
  "booking.bill.quoted": "Hiwalay na ibibigay ang presyo",
  "booking.bill.discount": "Diskwento ng Senior / PWD ({pct}%), bine-verify ang valid ID sa gate",
  "booking.bill.cottage": "Cottage",
  "booking.bill.total": "Kabuuang booking",
  "booking.deposit.title": "Maibabalik na deposito sa add-on",
  "booking.deposit.body":
    "Ito ay hawak lamang, hindi kasama sa kabuuan at hindi sinisingil online. Bayaran ito nang cash sa counter kapag kinuha mo ang iyong mga add-on; ibabalik ito nang buo kapag naibalik ang mga gamit na walang sira.",

  "booking.page.eyebrow": "I-reserve ang iyong araw sa pool",
  "booking.page.title": "Piliin ang perpektong oras ng iyong paglangoy",
  "booking.page.description": "Nag-a-update ang availability habang pumipili ka.",
  "booking.step1.title": "Kailan ang bisita ninyo?",
  "booking.step2.title": "Ilan ang lalangoy?",
  "booking.step3.title": "Pumili ng oras",
  "booking.step4.title": "Gawing sa iyo ang araw na ito",
  "booking.step5.title": "Mga add-on (opsyonal)",
  "booking.date.label": "Petsa ng bisita",
  "booking.date.notOpen": "Hindi bukas ang kasalukuyang napiling petsa. Pumili ng isa sa mga available na petsa sa itaas.",
  "booking.date.tuesday": "Sarado tuwing Martes para sa disinfection ng buong resort. Pumili po ng ibang petsa.",
  "booking.date.tuesdayReason": "Sarado tuwing Martes para sa disinfection",
  "booking.party.room":
    "Ang presyo ng kuwarto ay kada kuwarto (kasama ang anim na bisita), hindi kada bisita. Mahalaga pa rin ang bilang ng tao para sa kaligtasan at sa singil sa sobrang bisita.",
  "booking.party.event":
    "Ang presyo ng event sa pavilion ay kada apat na oras. Nakakatulong ang bilang ng tao para maplano namin ang mga mesa at lifeguard.",
  "booking.party.needSupervisor":
    "Kailangan ng kahit isang matanda, senior citizen o PWD na bisita para magbantay sa grupo.",
  "booking.slot.selected": "Napili",
  "booking.slot.closed": "Sarado · {reason}",
  "booking.slot.waitlistSelected": "Napili para sa waitlist",
  "booking.slot.fullJoin": "Puno · Sumali sa waitlist",
  "booking.slot.spotsLeft": "{n} na lugar ang natitira",
  "booking.slot.thisSession": "Sesyong ito",
  "booking.type.pool.title": "Pasok sa pool lamang",
  "booking.type.pool.text": "Dalhin lang ang saya. Magkakasama sa mga mesa.",
  "booking.type.cottage.title": "Pool + cottage",
  "booking.type.cottage.text": "Sarili mong may lilim na pahingahan.",
  "booking.type.room.title": "Tuluyan sa kuwarto",
  "booking.type.room.text": "2:00 PM hanggang 11:00 AM kinabukasan · hanggang 6 ang kasama",
  "booking.type.event.title": "Event sa pavilion",
  "booking.type.event.text": "Pumili ng apat na oras na event",
  "booking.event.label": "Piliin ang iskedyul ng iyong apat na oras na event",
  "booking.event.fourHours": "{range} · 4 na oras",
  "booking.unit.unavailable": "Hindi available",
  "booking.unit.taken": "Nakuha na",
  "booking.unit.tooSmall": "Masyadong maliit",
  "booking.unit.availableOf": "{left} sa {total} ang available",
  "booking.unit.upTo": "Hanggang {n} · {amenities}",
  "booking.unit.roomNote":
    "Kasama ang anim na bisita; ₱250 ang bawat karagdagang bisita. Maaaring lumangoy mula 8 hanggang 11 AM.",
  "booking.unit.eventNote":
    "Apat na oras. Hindi kasama ang pasok sa pool; may corkage para sa mga panlabas na supplier.",
  "booking.unit.cottageNote":
    "Hiwalay ang bayad sa cottage/mesa sa pasok sa paglangoy. Hanggang {hours} oras lamang ang pamamalagi sa cottage para sa sesyong ito.",
  "booking.unit.baseRate": "Kukumpirmahin ng staff ang batayang singil",
  "booking.addons.title":
    "Mag-reserve ng ihawan, karaoke at dagdag na upuan para sa {date}. Binibilang ang stock kada petsa.",

  "booking.summary.title": "Ang iyong bisita",
  "booking.summary.held": "Naka-hold {time}",
  "booking.summary.chooseSlot": "Pumili ng oras",
  "booking.summary.guests": "{n} bisita",
  "booking.summary.rentalHours": "Oras ng upa (hanggang {n})",
  "booking.summary.hour": "{n} oras",
  "booking.summary.hours": "{n} oras",
  "booking.summary.poolLabel": "Appointment sa pool:",
  "booking.summary.poolBody": "bayaran ang buong {amount} para makumpirma.",
  "booking.summary.downLabel": "{pct}% downpayment:",
  "booking.summary.downBody": "Ang {now} ngayon ay magre-reserve nito. Ang balanse na {balance} ay babayaran mamaya.",
  "booking.summary.continue": "Magpatuloy sa bayad",
  "booking.summary.login": "Mag-log in para magpatuloy",
  "booking.summary.back": "Bumalik",
  "booking.summary.nextHint":
    "Susunod: waiver at health declaration, saka bayad. Naka-hold ang iyong puwesto pagkatapos mong isumite ang detalye ng bayad.",
  "booking.summary.browseHint": "Malaya kang mag-browse. Kailangan ng account para makapag-reserve.",

  "booking.hold.expired": "Nag-expire ang hold",
  "booking.hold.endsIn": "Matatapos ang hold sa {clock}",
  "booking.hold.slotHeld": "Naka-hold ang puwesto sa loob ng {clock}",
  "booking.hold.warn":
    "Matatapos ang hold mo sa loob ng wala pang 15 minuto. Magbayad na ngayon o ibibigay ang puwesto sa ibang bisita.",
  "booking.hold.normal":
    "Magbayad (o mag-upload ng patunay) bago matapos ang hold, kung hindi ay awtomatikong ilalabas ang puwesto.",

  "booking.conflict.past": "Lumipas na ang petsang iyon. Pumili po ng petsa ngayon o mas huli pa.",
  "booking.conflict.tuesday": "Sarado ang resort tuwing Martes. Pumili po ng ibang petsa.",
  "booking.conflict.closed": "Sarado sa petsang ito: {reason}.",
  "booking.conflict.full": "Puno na ang {label} sa petsang ito ({n} na lugar ang natitira). Pumili po ng ibang oras.",
  "booking.conflict.taken": "Katatapos lang i-reserve ng ibang bisita ang cottage / kuwartong iyon. Pumili po ng iba.",

  "waiver.rules.title": "Mga patakaran ng resort",
  "waiver.rules.sub": "Lagyan ng tsek ang bawat patakaran bilang pagsang-ayon ninyo ng iyong grupo na susundin ito.",
  "waiver.rule.0": "Bawal sumisid sa alinmang bahagi ng pool.",
  "waiver.rule.1": "Dapat aktibong binabantayan ng isang matanda ang bawat bata sa lahat ng oras.",
  "waiver.rule.2": "Kailangan ng wastong pang-swimming na damit sa tubig.",
  "waiver.health.title": "Health declaration",
  "waiver.health.sub": "Mayroon ba sa inyong grupo na kasalukuyang may alinman sa mga sumusunod?",
  "waiver.health.wounds": "Bukas na sugat, hiwa, o sugat sa balat",
  "waiver.health.contagious":
    "Nakahahawang sakit (lagnat, trangkaso, impeksyon sa balat, impeksyon sa mata)",
  "waiver.health.cardio": "Kondisyon sa puso, presyon, o paghinga (hal. hika)",
  "waiver.health.pregnant": "Kasalukuyang buntis",
  "waiver.health.other": "Iba pang kondisyong pangkalusugan na dapat naming malaman",
  "waiver.health.yes": "Oo",
  "waiver.health.no": "Hindi",
  "waiver.health.otherLabel": "Pakilarawan ang kondisyon (kailangan)",
  "waiver.health.otherPlaceholder": "hal. Kamakailang operasyon, epilepsy",
  "waiver.health.thanks":
    "Salamat sa pagbabahagi. Hindi nito ikakansela ang iyong booking; magkakaroon lamang ang aming staff ng mabilis at pribadong pag-check sa iyo sa gate para matiyak na ligtas ang iyong paglangoy.",
  "waiver.guardian.title": "Pahintulot ng magulang / tagapag-alaga",
  "waiver.guardian.subOne":
    "May {n} bata sa inyong grupo. Kailangang magbigay ng pahintulot ang magulang o legal na tagapag-alaga para sa kanya.",
  "waiver.guardian.subMany":
    "May {n} bata sa inyong grupo. Kailangang magbigay ng pahintulot ang magulang o legal na tagapag-alaga para sa kanila.",
  "waiver.guardian.name": "Buong pangalan ng tagapag-alaga",
  "waiver.guardian.relationship": "Relasyon sa bata",
  "waiver.guardian.relationshipPlaceholder": "hal. Ina, Legal na tagapag-alaga",
  "waiver.guardian.contact": "Numero ng telepono",
  "waiver.guardian.contactPlaceholder": "09XXXXXXXXX",
  "waiver.guardian.signature": "Digital na lagda (i-type ang buong pangalan)",
  "waiver.guardian.signatureError": "Dapat tumugma ang lagda sa buong pangalan ng tagapag-alaga.",
  "waiver.guardian.confirmOne":
    "Ako ang magulang o legal na tagapag-alaga ng {n} bata sa booking na ito. Pumapayag akong lumangoy siya, tinatanggap ko ang mga patakaran sa itaas para sa kanya, at aktibo ko siyang babantayan sa lahat ng oras.",
  "waiver.guardian.confirmMany":
    "Ako ang magulang o legal na tagapag-alaga ng {n} bata sa booking na ito. Pumapayag akong lumangoy sila, tinatanggap ko ang mga patakaran sa itaas para sa kanila, at aktibo ko silang babantayan sa lahat ng oras.",
  "waiver.privacy.title": "Pahintulot sa data privacy",
  "waiver.privacy.ack":
    "Nabasa ko ang Data Privacy Notice at pumapayag ako sa pagproseso ng aking booking at contact details.",
  "waiver.privacy.dpaLabel": "Hiwalay na pahintulot:",
  "waiver.privacy.dpa":
    "Malinaw akong pumapayag sa pangongolekta at paggamit ng aking health declaration, na Sensitive Personal Information sa ilalim ng RA 10173, para lamang sa kaligtasan sa pool.",

  "waiver.missing.rules": "Lagyan ng tsek ang bawat patakaran ng resort.",
  "waiver.missing.health": "Sagutin ng Oo o Hindi ang bawat tanong tungkol sa kalusugan.",
  "waiver.missing.healthOther": "Ilarawan ang iba pang kondisyong pangkalusugan.",
  "waiver.missing.guardian": "Kumpletuhin ang pangalan, relasyon at contact ng magulang / tagapag-alaga.",
  "waiver.missing.signature": "I-type ang buong pangalan ng tagapag-alaga nang eksakto bilang lagda.",
  "waiver.missing.confirm": "Kumpirmahin ang pahayag ng pahintulot ng tagapag-alaga.",
  "waiver.missing.privacy": "Kilalanin ang Data Privacy Notice.",
  "waiver.missing.dpa": "Magbigay ng pahintulot sa pagproseso ng health declaration.",

  "waiver.notice.summary": "Data Privacy Notice (RA 10173, Data Privacy Act of 2012)",
  "waiver.notice.p1":
    "Kinokolekta ng Golden Pyramid Swimming Pool ang iyong pangalan, contact details, at impormasyon sa booking at bayad para maisagawa ang iyong reservation, ma-verify ang mga bayad at mapanatiling ligtas ang mga bisita.",
  "waiver.notice.p1health":
    " Ang iyong health declaration ay Sensitive Personal Information sa ilalim ng batas: ginagamit lamang ito ng staff sa gate at mga lifeguard para sa kaligtasan sa pool, hindi ibinabahagi sa labas ng resort, at iniingatan hangga't kailangan para sa kaligtasan at legal na talaan.",
  "waiver.notice.p2":
    "Maaari mong i-access, ipaayos o ipabura ang iyong data, bawiin ang pahintulot, o magsampa ng reklamo sa National Privacy Commission. Mag-email sa resort desk para gamitin ang mga karapatang ito.",

  "waiver.record.title": "Tinanggap na ang waiver at health declaration",
  "waiver.record.accepted": "Tinanggap noong",
  "waiver.record.version": "Bersyon",
  "waiver.record.hash": "Record hash",
  "waiver.record.guardian": "Tagapag-alaga",
  "waiver.record.guardianLineOne": "{name} ({relationship}) para sa {n} bata",
  "waiver.record.guardianLineMany": "{name} ({relationship}) para sa {n} bata",
  "waiver.record.other": "Iba pang kondisyon",
  "waiver.record.flagged": "May idineklarang health item; kakausapin ka ng staff sa gate.",
  "waiver.record.locked": "Naka-lock ang talaang ito at hindi na maaaring baguhin.",
}
