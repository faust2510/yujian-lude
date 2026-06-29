import { api, backendOnline } from "./api.js";

const STORAGE_KEY = "yujian_lude_profile";

const candidates = [
  {
    code: "A-1027",
    city: "杭州",
    age: "29-32",
    education: "硕士",
    goal: "以结婚为目标相处",
    reason: "同城、教育背景接近，均重视稳定关系和家庭沟通。",
    status: "可提交审核"
  },
  {
    code: "A-1183",
    city: "上海",
    age: "31-35",
    education: "本科",
    goal: "一年内稳定关系",
    reason: "生活节奏和关系目标接近，需要顾问确认异地接受度。",
    status: "顾问复核中"
  },
  {
    code: "A-1305",
    city: "南京",
    age: "28-33",
    education: "博士",
    goal: "以结婚为目标相处",
    reason: "价值观描述匹配，但职业节奏较忙，建议先做边界沟通。",
    status: "可提交审核"
  },
  {
    code: "A-1428",
    city: "苏州",
    age: "30-36",
    education: "本科",
    goal: "先深入了解再决定",
    reason: "同属长三角城市，沟通节奏较稳，需要确认未来定居计划。",
    status: "可提交审核"
  },
  {
    code: "A-1516",
    city: "宁波",
    age: "27-31",
    education: "硕士",
    goal: "一年内稳定关系",
    reason: "关系目标明确，家庭观念描述接近，建议顾问先核对职业节奏。",
    status: "可提交审核"
  }
];

const profileForm = document.querySelector("#profileForm");
const profilePercent = document.querySelector("#profilePercent");
const progressRing = document.querySelector(".progress-ring");
const profileTips = document.querySelector("#profileTips");
const matchGrid = document.querySelector("#matchGrid");
const filterCity = document.querySelector("#filterCity");
const filterEducation = document.querySelector("#filterEducation");
const resetFilters = document.querySelector("#resetFilters");
const quickSearch = document.querySelector("#quickSearch");
const askAi = document.querySelector("#askAi");
const aiQuestion = document.querySelector("#aiQuestion");
const aiAnswer = document.querySelector("#aiAnswer");
const creditCount = document.querySelector("#creditCount");
const questionChips = document.querySelector("#questionChips");
const chatForm = document.querySelector("#chatForm");
const chatInput = document.querySelector("#chatInput");
const messageList = document.querySelector("#messageList");
const supportDialog = document.querySelector("#supportDialog");
const openSupport = document.querySelector("#openSupport");

function readProfile() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeProfile(profile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

function readCredits() {
  return null;
}

function writeCredits() {
  // AI 咨询免费不限量，不再记次数。保留空函数以兼容旧调用。
}

function getProfileFromForm() {
  const formData = new FormData(profileForm);
  return {
    nickname: formData.get("nickname")?.trim() || "",
    city: formData.get("city")?.trim() || "",
    birthYear: formData.get("birthYear")?.trim() || "",
    education: formData.get("education") || "",
    goal: formData.get("goal") || "",
    preference: formData.get("preference")?.trim() || "",
    intro: formData.get("intro")?.trim() || "",
    privacy: formData.get("privacy") === "on"
  };
}

function fillProfileForm(profile) {
  Object.entries(profile).forEach(([key, value]) => {
    const field = profileForm.elements[key];
    if (!field) return;
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = value;
    }
  });
}

function updateProgress(profile) {
  const fields = ["nickname", "city", "birthYear", "education", "goal", "preference", "intro", "privacy"];
  const done = fields.filter((field) => Boolean(profile[field])).length;
  const percent = Math.round((done / fields.length) * 100);
  profilePercent.textContent = `${percent}%`;
  progressRing.style.setProperty("--progress", `${percent}%`);

  const tips = [];
  if (!profile.city) tips.push("补充城市，匹配会优先同城。");
  if (!profile.goal) tips.push("选择婚恋目标，顾问才能判断节奏。");
  if (!profile.preference) tips.push("写清期望对象，减少无效推荐。");
  if (!profile.privacy) tips.push("确认隐私授权，敏感信息不会公开展示。");
  if (tips.length === 0) tips.push("资料已具备初步匹配条件，可以提交顾问审核。");

  profileTips.innerHTML = tips.map((tip) => `<li>${tip}</li>`).join("");
}

function getProfileCompletion(profile) {
  const fields = ["nickname", "city", "birthYear", "education", "goal", "preference", "intro", "privacy"];
  const done = fields.filter((field) => Boolean(profile[field])).length;
  return Math.round((done / fields.length) * 100);
}

function renderMatches() {
  const city = filterCity.value;
  const education = filterEducation.value;
  const filtered = candidates.filter((candidate) => {
    const cityOk = city === "all" || candidate.city === city;
    const educationOk = education === "all" || candidate.education === education;
    return cityOk && educationOk;
  });

  if (filtered.length === 0) {
    matchGrid.innerHTML = `
      <div class="empty-state">
        <h3>暂时没有符合条件的匿名候选</h3>
        <p>可以放宽城市或学历筛选，或先完善资料让顾问补充推荐范围。</p>
        <button class="secondary-button" id="emptyResetFilters" type="button">重置筛选</button>
      </div>
    `;
    return;
  }

  matchGrid.innerHTML = filtered.map((candidate) => `
    <article class="match-card tilt-wrap">
      <div class="tilt-card">
        <header>
          <span class="match-code">${candidate.code}</span>
          <span class="status-pill">${candidate.status}</span>
        </header>
        <ul class="fact-list">
          <li>${candidate.city}</li>
          <li>${candidate.age}</li>
          <li>${candidate.education}</li>
          <li>${candidate.goal}</li>
        </ul>
        <h3>匹配理由</h3>
        <p>${candidate.reason}</p>
        <button class="primary-button full" type="button" data-review="${candidate.code}">提交顾问审核</button>
      </div>
    </article>
  `).join("");
}

function renderAiAnswer(question) {
  aiAnswer.innerHTML = `
    <h3>咨询结果</h3>
    <p>根据你的问题：“${escapeHtml(question)}”，当前建议先围绕资料完整度和沟通边界推进。</p>
    <div class="answer-list">
      <div><strong>资料判断：</strong>城市、婚恋目标、期望对象是匹配优先级最高的三项。</div>
      <div><strong>匹配建议：</strong>优先提交同城且目标明确的候选人给顾问复核，不建议只看年龄或学历。</div>
      <div><strong>风险提醒：</strong>未进入双方确认前，不交换联系方式、住址、证件和转账信息。</div>
      <div><strong>下一步：</strong>完善资料后，从匿名匹配中选择 1 位提交顾问审核。</div>
    </div>
  `;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addMessage(text, type = "self") {
  const message = document.createElement("div");
  message.className = `message ${type}`;
  message.textContent = text;
  messageList.appendChild(message);
  messageList.scrollTop = messageList.scrollHeight;
}

function showTyping() {
  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.id = "typingIndicator";
  indicator.innerHTML = "<span></span><span></span><span></span>";
  messageList.appendChild(indicator);
  messageList.scrollTop = messageList.scrollHeight;
}

function hideTyping() {
  const indicator = document.getElementById("typingIndicator");
  if (indicator) indicator.remove();
}

fillProfileForm(readProfile());
updateProgress(readProfile());
renderMatches();
initCourse();

/* ─── 恋爱必修课 打卡 ────────────────────────────────────── */
(function initLessonCheckin() {
  const LESSON_KEY = "lude_lesson_v1";
  const TOTAL = 3;
  const done = new Set(JSON.parse(localStorage.getItem(LESSON_KEY) || "[]"));

  function save() { localStorage.setItem(LESSON_KEY, JSON.stringify([...done])); }
  function render() {
    document.querySelectorAll(".lesson-card").forEach(card => {
      const id = card.dataset.lesson;
      const btn = card.querySelector(".lesson-checkin");
      if (done.has(id)) {
        card.classList.add("done");
        btn.textContent = "✓ 已打卡";
        btn.disabled = true;
      }
    });
    const el = document.getElementById("lessonProgress");
    if (el) el.textContent = `已打卡 ${done.size} / ${TOTAL} 单元`;
  }

  document.querySelectorAll(".lesson-checkin").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.lesson;
      if (!id || done.has(id)) return;
      const reflec = prompt("请写下你的感受（50 字以上）：");
      if (!reflec || reflec.trim().length < 50) {
        alert("请至少写 50 个字的感受后才能打卡 :)");
        return;
      }
      done.add(id);
      save();
      render();
      if (done.size >= TOTAL) alert("🎉 恋爱必修课完成！曝光加分已解锁。");
    });
  });

  render();
})();

/* ─── 信仰知识测试 ───────────────────────────────────────── */
(function initFaithTest() {
  const introEl = document.getElementById("faithTestIntro");
  const formEl  = document.getElementById("faithTestForm");
  const resultEl = document.getElementById("faithTestResult");
  const startBtn = document.getElementById("faithTestStart");
  const submitBtn = document.getElementById("faithSubmit");
  const retakeBtn = document.getElementById("faithRetake");
  const questionsEl = document.getElementById("faithQuestions");
  const statusEl = document.getElementById("faithStatus");
  const statusTitle = document.getElementById("faithStatusTitle");
  const statusDesc  = document.getElementById("faithStatusDesc");
  const progressFill = document.getElementById("faithProgressFill");
  const progressText = document.getElementById("faithProgressText");
  const resultScore  = document.getElementById("faithResultScore");
  const resultMsg    = document.getElementById("faithResultMessage");
  if (!startBtn) return;

  let questions = [];
  let answers = {};

  function updateStatus(state, title, desc) {
    if (!statusEl) return;
    statusEl.dataset.state = state;
    if (statusTitle) statusTitle.textContent = title;
    if (statusDesc)  statusDesc.textContent  = desc;
  }

  function showSection(section) {
    [introEl, formEl, resultEl].forEach(el => { if (el) el.hidden = (el !== section); });
  }

  function updateProgress() {
    const answered = Object.keys(answers).length;
    const total = questions.length || 20;
    if (progressFill) progressFill.style.width = `${(answered / total) * 100}%`;
    if (progressText) progressText.textContent  = `已作答 ${answered} / ${total}`;
    if (submitBtn) submitBtn.disabled = answered < total;
  }

  function renderQuestions(qs) {
    if (!questionsEl) return;
    questionsEl.innerHTML = "";
    qs.forEach((q, i) => {
      const div = document.createElement("div");
      div.className = "faith-question";
      div.innerHTML = `<p>${i + 1}. ${q.text}</p>
        <div class="faith-options">${q.options.map((opt, j) =>
          `<label><input type="radio" name="q${q.id}" value="${j}" />${opt}</label>`
        ).join("")}</div>`;
      div.querySelectorAll("input[type=radio]").forEach(radio => {
        radio.addEventListener("change", () => {
          answers[q.id] = parseInt(radio.value, 10);
          updateProgress();
        });
      });
      questionsEl.appendChild(div);
    });
    updateProgress();
  }

  async function loadStatus() {
    if (!(await backendOnline())) return;
    try {
      const data = await api.faithTestStatus();
      if (data.attempted && data.latest) {
        const passed = data.latest.passed;
        updateStatus(
          passed ? "passed" : "failed",
          passed ? `测试通过 · 得分 ${data.latest.score}/20` : `未通过 · 得分 ${data.latest.score}/20`,
          passed ? "你已进入匹配池，恭喜！" : "可以重新测试，建议复习基要真理后再来。"
        );
      }
    } catch (e) { /* 离线静默 */ }
  }

  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    try {
      if (await backendOnline()) {
        const data = await api.faithTestQuestions();
        questions = data.questions || [];
      }
      if (!questions.length) {
        // 离线占位：展示提示
        showSection(formEl);
        if (questionsEl) questionsEl.innerHTML = "<p style='color:var(--muted)'>离线模式下暂无题目，请连接后端后再测试。</p>";
        if (submitBtn) submitBtn.hidden = true;
        return;
      }
      answers = {};
      renderQuestions(questions);
      showSection(formEl);
    } catch (e) {
      alert("加载题目失败，请稍后再试。");
    } finally {
      startBtn.disabled = false;
    }
  });

  if (formEl) formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "评分中…"; }
    try {
      const answersArr = questions.map(q => answers[q.id] ?? -1);
      const res = await api.faithTestSubmit(answersArr);
      if (resultScore) resultScore.textContent = `${res.score} / ${res.total}`;
      if (resultMsg)   resultMsg.textContent   = res.passed
        ? "恭喜通过！你已满足进入匹配池的信仰测试条件。"
        : `得分 ${res.score} 题，未达到 15 题通过线。建议回到教会与牧者一起温习基要真理，通过后可重新测试。`;
      updateStatus(
        res.passed ? "passed" : "failed",
        res.passed ? `测试通过 · ${res.score}/20` : `未通过 · ${res.score}/20`,
        res.passed ? "已进入匹配池" : "可重新测试"
      );
      showSection(resultEl);
    } catch (err) {
      alert("提交失败，请检查网络后重试。");
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "提交评分"; }
    }
  });

  if (retakeBtn) retakeBtn.addEventListener("click", () => {
    answers = {};
    renderQuestions(questions);
    showSection(formEl);
    updateProgress();
  });

  loadStatus();
})();

/* ─── 牧者介绍信 ─────────────────────────────────────────── */
(function initPastorLetter() {
  const panel  = document.getElementById("pastorLetterPanel");
  const toggle = document.getElementById("pastorLetterToggle");
  const form   = document.getElementById("pastorLetterForm");
  const cancel = document.getElementById("pastorLetterCancel");
  const badge  = document.getElementById("pastorLetterBadge");
  if (!toggle || !form) return;

  async function loadLetter() {
    if (!(await backendOnline())) return;
    try {
      const data = await api.getPastorLetter();
      if (data.letter) {
        populateForm(data.letter);
        if (badge) { badge.textContent = "已填写"; badge.classList.add("filled"); }
        if (toggle) toggle.textContent = "编辑介绍信";
      }
    } catch (e) { /* 离线静默 */ }
  }

  function populateForm(letter) {
    ["pastor_name","pastor_contact","family_note","faith_note","spiritual_note","church_life_note"].forEach(k => {
      const el = form.querySelector(`[name="${k}"]`);
      if (el && letter[k]) el.value = letter[k];
    });
  }

  toggle.addEventListener("click", () => {
    const isHidden = form.hidden;
    form.hidden = !isHidden;
    toggle.textContent = isHidden ? "收起" : (badge && badge.classList.contains("filled") ? "编辑介绍信" : "填写介绍信");
  });

  if (cancel) cancel.addEventListener("click", () => {
    form.hidden = true;
    toggle.textContent = badge && badge.classList.contains("filled") ? "编辑介绍信" : "填写介绍信";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("pastorLetterSave");
    if (btn) { btn.disabled = true; btn.textContent = "保存中…"; }
    const body = {};
    ["pastor_name","pastor_contact","family_note","faith_note","spiritual_note","church_life_note"].forEach(k => {
      const el = form.querySelector(`[name="${k}"]`);
      if (el) body[k] = el.value;
    });
    try {
      if (await backendOnline()) {
        await api.savePastorLetter(body);
      }
      if (badge) { badge.textContent = "已填写"; badge.classList.add("filled"); }
      if (toggle) toggle.textContent = "编辑介绍信";
      form.hidden = true;
      alert("介绍信已保存。仅与你互有意向的匹配对象可见。");
    } catch (err) {
      alert("保存失败，请稍后再试。");
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "保存介绍信"; }
    }
  });

  loadLetter();
})();

function clearFieldErrors() {
  profileForm.querySelectorAll("[data-field]").forEach((wrap) => {
    wrap.classList.remove("is-error");
    const msg = wrap.querySelector(".field-error");
    if (msg) msg.textContent = "";
  });
}

function setFieldError(field, message) {
  const wrap = profileForm.querySelector(`[data-field="${field}"]`);
  if (!wrap) return;
  wrap.classList.add("is-error");
  const msg = wrap.querySelector(".field-error");
  if (msg) msg.textContent = message;
}

function validateProfile(profile) {
  const errors = {};
  if (!profile.city) {
    errors.city = "请填写所在城市，匹配会优先同城。";
  }
  if (!profile.birthYear) {
    errors.birthYear = "请填写出生年份。";
  } else if (!/^\d{4}$/.test(profile.birthYear)) {
    errors.birthYear = "请输入 4 位数字年份，例如 1992。";
  } else {
    const year = Number(profile.birthYear);
    const maxYear = new Date().getFullYear() - 18;
    if (year < 1940 || year > maxYear) {
      errors.birthYear = `年份需在 1940 至 ${maxYear} 之间。`;
    }
  }
  if (!profile.goal) {
    errors.goal = "请选择婚恋目标，顾问才能判断节奏。";
  }
  if (!profile.privacy) {
    errors.privacy = "请勾选隐私授权后再提交。";
  }
  return errors;
}

profileForm.addEventListener("input", (event) => {
  updateProgress(getProfileFromForm());
  const wrap = event.target.closest("[data-field]");
  if (wrap && wrap.classList.contains("is-error")) {
    wrap.classList.remove("is-error");
    const msg = wrap.querySelector(".field-error");
    if (msg) msg.textContent = "";
  }
});

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const profile = getProfileFromForm();

  clearFieldErrors();
  const errors = validateProfile(profile);
  const errorKeys = Object.keys(errors);
  if (errorKeys.length > 0) {
    errorKeys.forEach((key) => setFieldError(key, errors[key]));
    const firstWrap = profileForm.querySelector(`[data-field="${errorKeys[0]}"]`);
    if (firstWrap) {
      const focusable = firstWrap.querySelector("input, select");
      if (focusable) focusable.focus({ preventScroll: false });
    }
    return;
  }

  // 本地存储始终写入（离线降级保底）；后端在线时同步保存
  const saved = writeProfile(profile);
  updateProgress(profile);

  let synced = false;
  if (await backendOnline()) {
    try {
      await api.saveProfile(profile);
      synced = true;
    } catch (err) {
      synced = false;
    }
  }

  if (synced) {
    addMessage("资料已保存到你的账户。我会根据城市和婚恋目标重新整理匹配建议。", "adviser");
  } else if (saved) {
    addMessage("资料已保存在本机。登录后会自动同步到你的账户。", "adviser");
  } else {
    addMessage("资料已更新，但当前浏览器无法写入本地存储。刷新后可能需要重新填写。", "adviser");
  }
});

quickSearch.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(quickSearch);
  filterCity.value = data.get("city") || "all";
  renderMatches();
  location.hash = "match";
});

filterCity.addEventListener("change", renderMatches);
filterEducation.addEventListener("change", renderMatches);
resetFilters.addEventListener("click", () => {
  filterCity.value = "all";
  filterEducation.value = "all";
  renderMatches();
});

matchGrid.addEventListener("click", (event) => {
  if (event.target.closest("#emptyResetFilters")) {
    filterCity.value = "all";
    filterEducation.value = "all";
    renderMatches();
    return;
  }

  const button = event.target.closest("[data-review]");
  if (!button) return;
  const code = button.dataset.review;
  const profile = getProfileFromForm();
  const completion = getProfileCompletion(profile);
  if (completion < 75 || !profile.privacy) {
    addMessage(`我想提交 ${code} 给顾问审核，请帮我看匹配风险。`);
    addMessage("提交前请先补齐资料并确认隐私授权。资料达到基本完整后，顾问才能进入审核流程。", "adviser");
    location.hash = "profile";
    return;
  }
  addMessage(`我想提交 ${code} 给顾问审核，请帮我看匹配风险。`);
  addMessage(`${code} 已加入顾问审核队列。顾问会先核对双方目标、城市安排和沟通边界。`, "adviser");
  location.hash = "chat";
});

questionChips.addEventListener("click", (event) => {
  if (event.target.tagName !== "BUTTON") return;
  aiQuestion.value = event.target.textContent;
  aiQuestion.focus();
});

askAi.addEventListener("click", async function onAskAi() {
  const question = aiQuestion.value.trim();
  if (!question) { aiQuestion.focus(); return; }

  askAi.disabled = true;
  aiAnswer.innerHTML = [
    '<div class="ai-loading">',
    '  <span>正在为你思考</span>',
    '  <span class="dot"></span>',
    '  <span class="dot"></span>',
    '  <span class="dot"></span>',
    '</div>'
  ].join("");

  try {
    if (await backendOnline()) {
      const res = await api.askAi(question);
      const answer = res && (res.answer || res.reply || res.content);
      if (answer) {
        aiAnswer.innerHTML =
          '<h3>AI 咨询</h3>' + paragraphsToHtml(answer);
      } else {
        renderAiAnswer(question);
      }
    } else {
      renderAiAnswer(question);
    }
  } catch {
    // 后端异常时降级到本地静态回复，保证体验不中断。
    renderAiAnswer(question);
  } finally {
    askAi.disabled = false;
  }
});

function paragraphsToHtml(text) {
  return String(text)
    .split(/\n{2,}|\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  addMessage(text);
  chatInput.value = "";
  showTyping();
  setTimeout(() => {
    hideTyping();
    addMessage("收到。我会先检查资料、候选条件和沟通边界，再给你下一步建议。", "adviser");
  }, 1200);
});

openSupport.addEventListener("click", () => {
  if (typeof supportDialog.showModal === "function") {
    supportDialog.showModal();

    const closeBtn = supportDialog.querySelector('button[value="close"]');
    if (closeBtn) {
      const firstFocusable = supportDialog.querySelector("button, input, select, textarea, a[href]");
      if (firstFocusable) firstFocusable.focus();
    }

    const dialogObserver = new MutationObserver(() => {
      if (supportDialog.open && closeBtn) closeBtn.focus();
    });
    dialogObserver.observe(supportDialog, { attributes: true, attributeFilter: ["open"] });

    supportDialog.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Tab") {
          const focusable = supportDialog.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]'
          );
          if (!focusable.length) { e.preventDefault(); return; }
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      },
      { once: true }
    );
    return;
  }
  addMessage("我想联系顾问，请安排一次服务说明。");
  location.hash = "chat";
});

/* ─── Parallax scroll + sticky header state ─── */
(function initParallax() {
  const bg = document.querySelector(".parallax-bg");
  const header = document.querySelector(".site-header");
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(() => {
        const sy = window.scrollY;
        if (bg) bg.style.transform = `translateY(${sy * 0.35}px) scale(1.1)`;
        if (header) header.classList.toggle("scrolled", sy > 40);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();

/* ─── Scroll-spy: highlight current section in nav ─── */
(function initScrollSpy() {
  const links = Array.from(document.querySelectorAll(".top-nav a[href^='#']"));
  if (!links.length || !("IntersectionObserver" in window)) return;
  const map = new Map();
  links.forEach((a) => {
    const sec = document.querySelector(a.getAttribute("href"));
    if (sec) map.set(sec, a);
  });
  if (!map.size) return;
  const setActive = (a) => {
    links.forEach((l) => l.classList.toggle("active", l === a));
  };
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(map.get(entry.target));
      });
    },
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
  );
  map.forEach((_, sec) => observer.observe(sec));
})();

/* ─── IntersectionObserver for scroll-entry animations ─── */
(function initScrollAnimations() {
  const targets = document.querySelectorAll(".animate-in");
  if (!targets.length || !("IntersectionObserver" in window)) {
    targets.forEach(el => el.classList.add("visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  targets.forEach((el) => observer.observe(el));
  requestAnimationFrame(() => {
    targets.forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        el.classList.add("visible");
        observer.unobserve(el);
      }
    });
  });
})();

// Mobile hamburger navigation
(function initMobileNav() {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("topNav");
  const header = document.querySelector(".site-header");
  if (!toggle || !nav || !header) return;

  function closeMenu() {
    header.classList.remove("menu-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "打开导航菜单");
  }

  function openMenu() {
    header.classList.add("menu-open");
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "关闭导航菜单");
  }

  toggle.addEventListener("click", () => {
    if (header.classList.contains("menu-open")) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  // Close after picking a destination
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  // Esc closes; resizing back to desktop resets state
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) closeMenu();
  });
})();

/* ─── 课程：进度 + 完课徽章 ─────────────────────────────
 * 在线时读后端 api.listCourses/getCourse/enroll；离线降级到 localStorage。
 * 完课（10/10）时显示资料页「已完成婚姻装备」徽章。
 */
const COURSE_STORAGE_KEY = "lude_course_progress_v1";
const COURSE_SLUG = "marriage-meaning";
const COURSE_TOTAL_UNITS = 10;

function readCourseLocal() {
  try {
    const raw = localStorage.getItem(COURSE_STORAGE_KEY);
    if (!raw) return { enrolled: false, completed: 0 };
    return JSON.parse(raw);
  } catch (e) {
    return { enrolled: false, completed: 0 };
  }
}

function writeCourseLocal(state) {
  try {
    localStorage.setItem(COURSE_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* 忽略存储异常 */
  }
}

function renderCourseProgress(enrolled, completed, total) {
  const courseProgress = document.querySelector("#courseProgress");
  const courseProgressFill = document.querySelector("#courseProgressFill");
  const courseProgressText = document.querySelector("#courseProgressText");
  const courseEnroll = document.querySelector("#courseEnroll");
  const marriageBadge = document.querySelector("#marriageBadge");
  if (!courseProgress) return;

  const done = Math.min(completed, total);
  if (enrolled) {
    courseProgress.removeAttribute("hidden");
    if (courseProgressFill) courseProgressFill.style.width = `${(done / total) * 100}%`;
    if (courseProgressText) courseProgressText.textContent = `已完成 ${done} / ${total} 单元`;
    if (courseEnroll) {
      courseEnroll.textContent = done >= total ? "已完成 · 重温课程" : "继续学习";
    }
  } else {
    courseProgress.setAttribute("hidden", "");
    if (courseEnroll) courseEnroll.textContent = "开始学习";
  }

  // 完课触发资料页徽章
  if (marriageBadge) {
    if (done >= total) marriageBadge.removeAttribute("hidden");
    else marriageBadge.setAttribute("hidden", "");
  }
}

async function initCourse() {
  const courseEnroll = document.querySelector("#courseEnroll");
  if (!courseEnroll) return;

  let state = readCourseLocal();

  // 在线时尝试用后端真实进度覆盖本地
  if (await backendOnline()) {
    try {
      const course = await api.getCourse(COURSE_SLUG);
      if (course && typeof course === "object") {
        const total = course.totalUnits || course.total_units || COURSE_TOTAL_UNITS;
        const completed = course.completedUnits || course.completed_units || 0;
        const enrolled = course.enrolled ?? completed > 0;
        state = { enrolled, completed, total };
        writeCourseLocal(state);
      }
    } catch (e) {
      /* 后端无此课程或未登录，沿用本地状态 */
    }
  }

  renderCourseProgress(state.enrolled, state.completed, state.total || COURSE_TOTAL_UNITS);

  courseEnroll.addEventListener("click", async function onEnroll() {
    courseEnroll.disabled = true;
    try {
      if (!state.enrolled) {
        // 首次报名
        if (await backendOnline()) {
          try { await api.enroll(COURSE_SLUG); } catch (e) { /* 离线降级 */ }
        }
        state.enrolled = true;
        writeCourseLocal(state);
        renderCourseProgress(state.enrolled, state.completed, state.total || COURSE_TOTAL_UNITS);
      } else {
        // 已报名：跳到课程学习锚点（MVP 用 AI 区承接学习问答）
        const ai = document.querySelector("#ai");
        if (ai) window.scrollTo({ top: ai.offsetTop - 70, behavior: "smooth" });
      }
    } finally {
      courseEnroll.disabled = false;
    }
  });
}
