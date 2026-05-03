// Fake class data for testing without Person 1's backend.
// Person 4 will delete this file once the real backend is ready.

const MOCK_CLASSES = {
  "11111": { crn:"11111", name:"CS 161",  title:"Intro to CS",           building:"LPSC", room:"1003", days:"MWF", start:"09:00", end:"09:50" },
  "22222": { crn:"22222", name:"MTH 251", title:"Differential Calculus", building:"KEAR", room:"210",  days:"MWF", start:"10:00", end:"10:50" },
  "33333": { crn:"33333", name:"WR 121",  title:"English Composition",   building:"BEXL", room:"412",  days:"TTh", start:"14:00", end:"15:20" },
  "44444": { crn:"44444", name:"BI 221",  title:"Biology for Majors",    building:"WNGR", room:"153",  days:"MWF", start:"10:00", end:"11:50" },
};

async function getClass(crn) {
  // Swap this whole function body when Person 1's backend is ready:
  //
  // try {
  //   const r = await fetch(`http://localhost:5000/class/${crn}`);
  //   if (!r.ok) return null;
  //   return await r.json();
  // } catch (err) {
  //   console.error("Backend unreachable:", err);
  //   return null;
  // }

  return Promise.resolve(MOCK_CLASSES[crn.trim()] || null);
}
