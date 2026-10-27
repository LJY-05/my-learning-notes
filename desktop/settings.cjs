const select = document.getElementById("provider"),
  key = document.getElementById("key"),
  model = document.getElementById("model"),
  clear = document.getElementById("clear"),
  result = document.getElementById("result"),
  save = document.getElementById("save");
let status;
async function refresh() {
  status = await window.studybuddySettings.status();
  display();
}
function display() {
  key.value = "";
  clear.checked = false;
  model.value =
    select.value === "deepseek" ? status.deepseekModel : status.openaiModel;
  document.getElementById("configured").textContent = (
    select.value === "deepseek"
      ? status.deepseekConfigured
      : status.openaiConfigured
  )
    ? "已配置密钥；不会在此显示原密钥。"
    : "尚未配置此服务的密钥。";
}
select.addEventListener("change", () => {
  display();
  result.textContent = "";
});
document.getElementById("config").addEventListener("submit", async (e) => {
  e.preventDefault();
  save.disabled = true;
  result.textContent = "正在保存…";
  try {
    status = await window.studybuddySettings.save({
      provider: select.value,
      key: key.value,
      model: model.value.trim(),
      clear: clear.checked,
    });
    key.value = "";
    result.textContent = "已保存，可以关闭此窗口。";
    display();
  } catch {
    result.textContent = "保存或重启失败，请检查输入格式、文件权限，然后重试。";
  } finally {
    save.disabled = false;
  }
});
refresh().catch(
  () => (result.textContent = "读取配置失败，请关闭窗口后重试。"),
);
