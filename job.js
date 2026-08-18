const addTaskBtn = document.getElementById("add-schedule");
const closeBtn = document.getElementById("close-btn");
const overLay = document.getElementById("schedule-overlay");

addTaskBtn.addEventListener("click", () => {
  console.log("Opening add task overlay to create a new job.");
  overLay.style.display = overLay.style.display === "flex" ? "none" : "flex";
})

closeBtn.addEventListener("click", () => {
  console.log("Close button clicked.");
  overLay.style.display = overLay.style.display === "flex" ? "none" : "flex";
})