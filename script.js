const paceStatusInputs = document.querySelectorAll('input[name="paceStatus"]');
const knownPanel = document.querySelector("#knownPanel");
const unknownPanel = document.querySelector("#unknownPanel");
const tabButtons = document.querySelectorAll(".tab-button");
const measureTab = document.querySelector("#measureTab");
const presetTab = document.querySelector("#presetTab");
const plannerForm = document.querySelector("#plannerForm");
const raceDateInput = document.querySelector("#raceDate");
const planList = document.querySelector("#planList");
const planSummary = document.querySelector("#planSummary");
const planInsight = document.querySelector("#planInsight");
const recordImage = document.querySelector("#recordImage");
const fileName = document.querySelector("#fileName");
const coachButton = document.querySelector("#coachButton");
const coachResult = document.querySelector("#coachResult");

const today = new Date();
const defaultRaceDate = new Date(today);
defaultRaceDate.setDate(defaultRaceDate.getDate() + 112);
raceDateInput.min = toInputDate(today);
raceDateInput.value = toInputDate(defaultRaceDate);

let latestPlan = null;

paceStatusInputs.forEach((input) => {
  input.addEventListener("change", () => {
    const isKnown = input.value === "known" && input.checked;
    if (!input.checked) return;
    knownPanel.classList.toggle("is-hidden", !isKnown);
    unknownPanel.classList.toggle("is-hidden", isKnown);
  });
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    tabButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");
    const useMeasure = button.dataset.tab === "measure";
    measureTab.classList.toggle("is-hidden", !useMeasure);
    presetTab.classList.toggle("is-hidden", useMeasure);
  });
});

plannerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const profile = readProfile();

  if (!profile) return;

  latestPlan = buildPlan(profile);
  renderPlan(latestPlan);
});

recordImage.addEventListener("change", () => {
  const file = recordImage.files?.[0];
  fileName.textContent = file ? file.name : "러닝 앱 캡처 이미지를 올려주세요.";
});

coachButton.addEventListener("click", () => {
  const effort = document.querySelector("#effort").value;
  const completion = Number(document.querySelector("#completion").value);
  const hasImage = Boolean(recordImage.files?.[0]);
  const advice = getCoachingAdvice(effort, completion, hasImage);

  coachResult.innerHTML = `
    <strong>${advice.title}</strong>
    <p>${advice.message}</p>
    <ul>
      <li>${advice.nextRun}</li>
      <li>${advice.adjustment}</li>
      <li>${advice.recovery}</li>
    </ul>
  `;

  if (latestPlan) {
    latestPlan.adjustment = advice.planLabel;
    renderPlan(latestPlan);
  }
});

plannerForm.dispatchEvent(new Event("submit"));

function readProfile() {
  const status = document.querySelector('input[name="paceStatus"]:checked').value;
  const currentPaceSeconds =
    status === "known" ? paceToSeconds("#currentPace") : getUnknownPaceSeconds();
  const goalPaceSeconds = paceToSeconds("#goalPace");
  const goalDistance = Number(document.querySelector("#goalDistance").value);
  const sessions = Number(document.querySelector("#sessions").value);
  const raceDate = new Date(`${raceDateInput.value}T00:00:00`);

  if (!currentPaceSeconds || !goalPaceSeconds) {
    alert("페이스 또는 기록을 6:10, 32:00처럼 입력해 주세요.");
    return null;
  }

  if (Number.isNaN(raceDate.getTime()) || raceDate <= today) {
    alert("목표 날짜는 오늘 이후로 선택해 주세요.");
    return null;
  }

  return {
    status,
    currentPaceSeconds,
    goalPaceSeconds,
    goalDistance,
    sessions,
    raceDate,
  };
}

function getUnknownPaceSeconds() {
  const activeTab = document.querySelector(".tab-button.is-active").dataset.tab;

  if (activeTab === "preset") {
    return parsePace(document.querySelector("#presetPace").value);
  }

  const distance = Number(document.querySelector("#testDistance").value);
  const totalSeconds = parseDuration(document.querySelector("#testTime").value);
  return totalSeconds ? Math.round(totalSeconds / distance) : null;
}

function buildPlan(profile) {
  const daysUntilRace = Math.ceil((profile.raceDate - today) / 86400000);
  const totalWeeks = clamp(Math.ceil(daysUntilRace / 7), 4, 24);
  const paceGap = profile.currentPaceSeconds - profile.goalPaceSeconds;
  const intensity =
    paceGap > 45 ? "build" : paceGap > 5 ? "balanced" : paceGap > -20 ? "sharpen" : "protect";
  const longRunBase = Math.max(4, Math.round(profile.goalDistance * 0.28));
  const peakLongRun = Math.round(profile.goalDistance * (profile.goalDistance > 20 ? 0.76 : 0.9));
  const weeks = Array.from({ length: totalWeeks }, (_, index) => {
    const week = index + 1;
    const progress = week / totalWeeks;
    const isRecovery = week % 4 === 0 && week !== totalWeeks;
    const longRun = isRecovery
      ? Math.max(longRunBase, Math.round(longRunBase + (peakLongRun - longRunBase) * progress * 0.72))
      : Math.max(longRunBase, Math.round(longRunBase + (peakLongRun - longRunBase) * progress));
    const easyPace = secondsToPace(profile.currentPaceSeconds + 35);
    const tempoPace = secondsToPace(
      Math.round((profile.currentPaceSeconds + profile.goalPaceSeconds) / 2)
    );
    const goalPace = secondsToPace(profile.goalPaceSeconds);
    const workouts = makeWorkouts({
      week,
      totalWeeks,
      sessions: profile.sessions,
      longRun,
      easyPace,
      tempoPace,
      goalPace,
      intensity,
      isRecovery,
    });

    return { week, isRecovery, longRun, workouts };
  });

  return {
    ...profile,
    totalWeeks,
    intensity,
    weeks,
    adjustment: "기본 계획",
  };
}

function makeWorkouts({
  week,
  totalWeeks,
  sessions,
  longRun,
  easyPace,
  tempoPace,
  goalPace,
  intensity,
  isRecovery,
}) {
  const taper = week > totalWeeks - 2;
  const qualityLabel =
    intensity === "build"
      ? `가벼운 템포 ${Math.max(12, week * 2)}분, ${tempoPace}/km`
      : intensity === "sharpen"
      ? `목표 페이스 반복주 ${Math.min(6, week)}회, ${goalPace}/km`
      : intensity === "protect"
      ? `이지런 중심, 빠른 구간은 짧게 ${goalPace}/km`
      : `템포런 ${Math.max(15, week * 2)}분, ${tempoPace}/km`;

  const workouts = [
    `이지런 ${Math.max(4, Math.round(longRun * 0.42))}km, ${easyPace}/km`,
    isRecovery ? `회복주 ${Math.max(3, Math.round(longRun * 0.35))}km` : qualityLabel,
    taper ? `가벼운 롱런 ${Math.max(6, Math.round(longRun * 0.55))}km` : `롱런 ${longRun}km`,
  ];

  if (sessions >= 4) {
    workouts.splice(2, 0, `보강 또는 조깅 ${Math.max(4, Math.round(longRun * 0.32))}km`);
  }

  if (sessions >= 5) {
    workouts.splice(1, 0, `회복 조깅 ${Math.max(3, Math.round(longRun * 0.28))}km`);
  }

  return workouts;
}

function renderPlan(plan) {
  const raceLabel = plan.raceDate.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });
  const statusLabel = plan.status === "known" ? "입력한 페이스" : "추정한 페이스";
  const intensityLabel = {
    build: "먼저 오래 달리는 힘을 만드는 쪽으로 가요.",
    balanced: "거리와 페이스를 반반씩 챙기면 좋아요.",
    sharpen: "이미 꽤 가까워서 목표 페이스 감각을 살려요.",
    protect: "욕심내기보다 다치지 않고 유지하는 게 좋아요.",
  }[plan.intensity];

  planSummary.textContent = `${raceLabel}까지 ${plan.totalWeeks}주 남았어요. ${statusLabel} ${secondsToPace(
    plan.currentPaceSeconds
  )}/km 기준으로, 목표 ${secondsToPace(plan.goalPaceSeconds)}/km에 맞춰 핵심만 정리했어요.`;

  planInsight.innerHTML = `
    <strong>${plan.adjustment}</strong>
    <span>${intensityLabel}</span>
    <span>주 ${plan.sessions}회 기준으로, 힘든 주 뒤에는 가볍게 회복하는 흐름입니다.</span>
  `;

  planList.innerHTML = summarizePlan(plan)
    .map(
      (phase) => `
        <article class="week-card">
          <strong>${phase.title}</strong>
          <p>${phase.description}</p>
          <ul>
            ${phase.items.map((item) => `<li>${item}</li>`).join("")}
          </ul>
        </article>
      `
    )
    .join("");
}

function summarizePlan(plan) {
  const firstLongRun = plan.weeks[0].longRun;
  const middleLongRun = plan.weeks[Math.max(0, Math.floor(plan.totalWeeks * 0.45) - 1)].longRun;
  const peakLongRun = Math.max(...plan.weeks.map((week) => week.longRun));
  const goalPace = secondsToPace(plan.goalPaceSeconds);
  const easyPace = secondsToPace(plan.currentPaceSeconds + 35);
  const tempoPace = secondsToPace(
    Math.round((plan.currentPaceSeconds + plan.goalPaceSeconds) / 2)
  );

  return [
    {
      title: "1. 몸 풀기",
      description: "처음엔 기록보다 루틴을 만드는 게 먼저예요.",
      items: [`편한 달리기 ${easyPace}/km`, `긴 달리기 ${firstLongRun}km부터 시작`],
    },
    {
      title: "2. 조금씩 늘리기",
      description: "거리는 천천히 늘리고, 빠른 날은 짧게만 넣어요.",
      items: [`긴 달리기 ${middleLongRun}km 안팎`, `템포 구간은 ${tempoPace}/km 근처`],
    },
    {
      title: "3. 중요한 시기",
      description: "몸이 적응하면 목표 페이스를 짧게 연습합니다.",
      items: [`최대 긴 달리기 ${peakLongRun}km`, `목표 페이스 ${goalPace}/km 감각 체크`],
    },
    {
      title: "4. 대회 전 정리",
      description: "마지막엔 더 세게 하기보다 가볍게 만드는 게 핵심이에요.",
      items: ["훈련량 줄이고 컨디션 회복", "짧은 조깅과 스트레칭 중심"],
    },
  ];
}

function getCoachingAdvice(effort, completion, hasImage) {
  if (!hasImage) {
    return {
      title: "이미지 없이 체감도 기준으로 조정합니다",
      message: "기록 이미지를 올리면 더 잘 맞춰볼 수 있지만, 지금 선택한 느낌만으로도 가볍게 조정할 수 있어요.",
      nextRun: "다음 러닝은 편하게 30분만 뛰어보세요.",
      adjustment: "이번 주는 계획을 올리지 않고 그대로 갑니다.",
      recovery: "피곤하면 하루 쉬어도 괜찮아요.",
      planLabel: "보수적 조정",
    };
  }

  if (effort === "hard" || completion <= 60) {
    return {
      title: "오늘은 꽤 무리했어요",
      message: "다음 훈련은 욕심내기보다 몸을 다시 가볍게 만드는 쪽이 좋아요.",
      nextRun: "다음 러닝은 목표보다 훨씬 느리게 편하게 뛰세요.",
      adjustment: "이번 주 긴 달리기는 15% 정도 줄입니다.",
      recovery: "내일은 쉬거나 가볍게 걷는 정도가 좋아요.",
      planLabel: "피로 반영 조정",
    };
  }

  if (effort === "easy" && completion === 100) {
    return {
      title: "몸이 잘 따라오고 있어요",
      message: "오늘 느낌이 좋았다면 다음 주에 아주 조금만 올려도 됩니다.",
      nextRun: "다음 이지런 마지막 10분만 살짝 빠르게 마무리해요.",
      adjustment: "긴 달리기는 그대로 두고 빠른 구간만 조금 추가합니다.",
      recovery: "좋아도 한 번에 많이 올리지는 마세요.",
      planLabel: "적응 반영 조정",
    };
  }

  return {
    title: "지금 흐름 좋아요",
    message: "너무 쉽지도, 너무 힘들지도 않은 상태라 계획을 그대로 이어가면 됩니다.",
    nextRun: "다음 러닝은 예정대로 편하게 진행하세요.",
    adjustment: "긴 달리기와 빠른 훈련 모두 유지합니다.",
    recovery: "내일까지 피로가 남으면 페이스만 조금 낮추세요.",
    planLabel: "계획 유지",
  };
}

function paceToSeconds(selector) {
  return parsePace(document.querySelector(selector).value);
}

function parsePace(value) {
  const parts = String(value).trim().split(":").map(Number);
  if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
  return parts[0] * 60 + parts[1];
}

function parseDuration(value) {
  const parts = String(value).trim().split(":").map(Number);
  if (parts.length === 2 && parts.every((part) => !Number.isNaN(part))) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && parts.every((part) => !Number.isNaN(part))) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

function secondsToPace(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
