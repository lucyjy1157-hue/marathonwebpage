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

const today = startOfDay(new Date());
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
  document.querySelector("#plan-output").scrollIntoView({ behavior: "smooth", block: "start" });
});

recordImage.addEventListener("change", () => {
  const file = recordImage.files?.[0];
  fileName.textContent = file ? file.name : "러닝 앱 캡처 이미지를 올려주세요.";
});

coachButton.addEventListener("click", () => {
  const workout = readWorkout();

  if (!workout) return;

  renderWorkoutInsight(buildWorkoutInsight(workout, latestPlan));
});

function readProfile() {
  const status = document.querySelector('input[name="paceStatus"]:checked').value;
  const currentPaceSeconds =
    status === "known" ? paceToSeconds("#currentPace") : getUnknownPaceSeconds();
  const goalPaceSeconds = paceToSeconds("#goalPace");
  const goalDistance = Number(document.querySelector("#goalDistance").value);
  const sessions = Number(document.querySelector("#sessions").value);
  const raceDate = startOfDay(new Date(`${raceDateInput.value}T00:00:00`));

  if (!currentPaceSeconds || !goalPaceSeconds) {
    showPlanError("페이스는 6:10처럼 분:초 형식으로 입력해 주세요.");
    return null;
  }

  if (Number.isNaN(raceDate.getTime()) || raceDate <= today) {
    showPlanError("목표 날짜는 오늘 이후로 선택해 주세요.");
    return null;
  }

  return { status, currentPaceSeconds, goalPaceSeconds, goalDistance, sessions, raceDate };
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
  const level = getLevel(profile.currentPaceSeconds, paceGap);
  const zones = getTrainingZones(profile.currentPaceSeconds, profile.goalPaceSeconds);
  const longRunTarget = getLongRunTarget(profile.goalDistance, totalWeeks, level);
  const weeklyVolume = getWeeklyVolume(profile.goalDistance, profile.sessions, level, totalWeeks);
  const schedule = buildWeeklySchedule({
    sessions: profile.sessions,
    zones,
    goalDistance: profile.goalDistance,
    longRunTarget,
    weeklyVolume,
    level,
  });

  return {
    ...profile,
    totalWeeks,
    paceGap,
    level,
    zones,
    longRunTarget,
    weeklyVolume,
    schedule,
  };
}

function getLevel(currentPaceSeconds, paceGap) {
  if (currentPaceSeconds >= 430) return "starter";
  if (paceGap > 45) return "base";
  if (paceGap > 10) return "build";
  if (paceGap >= -10) return "specific";
  return "protect";
}

function getTrainingZones(currentPaceSeconds, goalPaceSeconds) {
  return {
    recovery: currentPaceSeconds + 65,
    easy: currentPaceSeconds + 35,
    steady: Math.round((currentPaceSeconds + goalPaceSeconds) / 2) + 8,
    tempo: Math.round((currentPaceSeconds + goalPaceSeconds) / 2) - 5,
    goal: goalPaceSeconds,
    interval: Math.max(goalPaceSeconds - 20, currentPaceSeconds - 35),
  };
}

function getLongRunTarget(goalDistance, totalWeeks, level) {
  const ratio = goalDistance >= 42 ? 0.34 : goalDistance >= 21 ? 0.42 : 0.55;
  const base = Math.round(goalDistance * ratio);
  const levelBonus = { starter: -2, base: 0, build: 1, specific: 2, protect: -1 }[level];
  const weekBonus = totalWeeks >= 12 ? 2 : 0;
  return Math.max(5, Math.round(base + levelBonus + weekBonus));
}

function getWeeklyVolume(goalDistance, sessions, level, totalWeeks) {
  const base = goalDistance >= 42 ? 28 : goalDistance >= 21 ? 20 : goalDistance >= 10 ? 14 : 9;
  const sessionBonus = (sessions - 3) * 5;
  const levelBonus = { starter: -4, base: 0, build: 3, specific: 5, protect: -2 }[level];
  const weekBonus = totalWeeks >= 16 ? 4 : totalWeeks <= 6 ? -3 : 0;
  return Math.max(8, Math.round(base + sessionBonus + levelBonus + weekBonus));
}

function buildWeeklySchedule({ sessions, zones, goalDistance, longRunTarget, weeklyVolume, level }) {
  const easyDistance = Math.max(4, Math.round(weeklyVolume * 0.22));
  const recoveryDistance = Math.max(3, Math.round(weeklyVolume * 0.16));
  const tempoMinutes = level === "starter" ? 12 : level === "base" ? 16 : 20;
  const intervalRepeats = level === "specific" ? 6 : 4;
  const goalLabel = goalDistance >= 21 ? "목표 페이스 적응" : "빠른 감각";

  const schedule = [
    {
      title: "화 · 이지런",
      detail: `${easyDistance}km를 ${paceRange(zones.easy, 10)}로 편하게`,
      reason: "숨이 차지 않는 강도로 주간 훈련의 바닥을 만듭니다.",
    },
    {
      title: "목 · 템포런",
      detail: `워밍업 후 ${tempoMinutes}분을 ${paceRange(zones.tempo, 8)}로`,
      reason: "현재 페이스와 목표 페이스 사이를 몸에 익히는 핵심 훈련입니다.",
    },
    {
      title: "주말 · 롱런",
      detail: `${longRunTarget}km를 ${paceRange(zones.easy + 10, 12)}로`,
      reason: "마라톤 준비에서 가장 중요한 오래 달리는 힘을 쌓습니다.",
    },
  ];

  if (sessions >= 4) {
    schedule.splice(2, 0, {
      title: "토 · 회복 조깅",
      detail: `${recoveryDistance}km를 ${paceRange(zones.recovery, 12)}로`,
      reason: "다음 롱런을 망치지 않도록 다리를 풀어주는 날입니다.",
    });
  }

  if (sessions >= 5) {
    schedule.splice(2, 0, {
      title: `금 · ${goalLabel}`,
      detail: `${intervalRepeats}회 반복, 600m는 ${paceRange(zones.interval, 6)}로`,
      reason: "목표 페이스가 낯설지 않게 짧고 선명하게 자극합니다.",
    });
  }

  return schedule;
}

function renderPlan(plan) {
  const raceLabel = plan.raceDate.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });
  const gapText =
    plan.paceGap > 0
      ? `목표보다 ${Math.round(plan.paceGap)}초/km 느린 상태`
      : `목표보다 ${Math.abs(Math.round(plan.paceGap))}초/km 빠르거나 비슷한 상태`;
  const levelText = {
    starter: "지금은 완주 루틴을 만드는 단계입니다.",
    base: "기초 지구력을 먼저 올리면 목표 페이스가 훨씬 편해집니다.",
    build: "목표 페이스에 가까워지는 중이라 템포런 비중을 조금 둡니다.",
    specific: "목표 페이스 근처라 실전 감각 훈련이 잘 맞습니다.",
    protect: "현재 능력이 충분하니 과훈련을 막는 게 중요합니다.",
  }[plan.level];

  planSummary.textContent = `${raceLabel}까지 ${plan.totalWeeks}주. 현재 ${secondsToPace(
    plan.currentPaceSeconds
  )}/km, 목표 ${secondsToPace(plan.goalPaceSeconds)}/km 기준으로 이번 주 훈련을 만들었습니다.`;

  planInsight.innerHTML = `
    <strong>${gapText}</strong>
    <span>${levelText}</span>
    <span>이번 주 총량은 약 ${plan.weeklyVolume}km, 롱런은 ${plan.longRunTarget}km가 적당합니다.</span>
  `;

  planList.innerHTML = [
    paceZoneCard(plan),
    ...plan.schedule.map(scheduleCard),
    ruleCard(plan),
  ].join("");
}

function paceZoneCard(plan) {
  return `
    <article class="week-card highlight-card">
      <strong>훈련 페이스 기준</strong>
      <p>모든 훈련은 이 범위를 기준으로 진행하세요.</p>
      <ul>
        <li>회복 조깅: ${paceRange(plan.zones.recovery, 12)}</li>
        <li>이지런: ${paceRange(plan.zones.easy, 10)}</li>
        <li>템포런: ${paceRange(plan.zones.tempo, 8)}</li>
        <li>목표 페이스: ${secondsToPace(plan.zones.goal)}/km</li>
      </ul>
    </article>
  `;
}

function scheduleCard(item) {
  return `
    <article class="week-card">
      <strong>${item.title}</strong>
      <p>${item.detail}</p>
      <ul>
        <li>${item.reason}</li>
      </ul>
    </article>
  `;
}

function ruleCard(plan) {
  const deloadDistance = Math.max(4, Math.round(plan.longRunTarget * 0.72));
  return `
    <article class="week-card">
      <strong>조정 규칙</strong>
      <p>몸 상태에 따라 이렇게 바꾸면 됩니다.</p>
      <ul>
        <li>다리가 무거우면 템포런 대신 ${deloadDistance}km 이지런</li>
        <li>롱런 다음 날은 빠른 훈련 금지</li>
        <li>2주 연속 편하면 롱런만 1~2km 증가</li>
      </ul>
    </article>
  `;
}

function readWorkout() {
  const distance = Number(document.querySelector("#workoutDistance").value);
  const workoutPace = paceToSeconds("#workoutPace");
  const effort = document.querySelector("#effort").value;
  const completion = Number(document.querySelector("#completion").value);
  const hasImage = Boolean(recordImage.files?.[0]);

  if (!distance || distance <= 0 || !workoutPace) {
    coachResult.textContent = "달린 거리와 평균 페이스를 입력해 주세요. 페이스는 6:20처럼 입력하면 됩니다.";
    return null;
  }

  return { distance, workoutPace, effort, completion, hasImage };
}

function buildWorkoutInsight(workout, plan) {
  const baselinePace = plan?.currentPaceSeconds || workout.workoutPace;
  const zones = plan?.zones || getTrainingZones(baselinePace, baselinePace - 20);
  const easyDiff = workout.workoutPace - zones.easy;
  const isLong = plan ? workout.distance >= plan.longRunTarget * 0.8 : workout.distance >= 8;
  const isFast = workout.workoutPace <= zones.tempo + 5;
  const isTooHard = workout.effort === "hard" || workout.completion <= 60;

  let title = "오늘 운동은 적정 범위예요";
  let message = `평균 ${secondsToPace(workout.workoutPace)}/km로 ${workout.distance}km를 뛰었습니다.`;
  let insight = "페이스와 체감도가 크게 어긋나지 않습니다.";
  let next = "다음 훈련은 예정대로 이지런으로 이어가면 됩니다.";

  if (isTooHard && isFast) {
    title = "오늘은 강도가 꽤 높았어요";
    insight = "빠른 페이스와 높은 체감도가 같이 나왔습니다. 바로 빠른 훈련을 반복하면 피로가 쌓일 수 있어요.";
    next = `다음 러닝은 ${paceRange(zones.recovery, 12)} 회복 조깅으로 ${Math.max(
      3,
      Math.round(workout.distance * 0.55)
    )}km만 뛰세요.`;
  } else if (isTooHard) {
    title = "페이스보다 피로가 더 크게 느껴졌어요";
    insight = "속도 자체보다 컨디션, 수면, 누적 피로의 영향을 받은 날로 보입니다.";
    next = `다음 훈련은 ${paceRange(zones.easy + 15, 10)} 이지런으로 낮추세요.`;
  } else if (isFast && workout.effort === "easy") {
    title = "목표 페이스 적응이 좋아요";
    insight = "빠른 편인데도 편안했다면 몸이 목표 페이스에 적응하고 있다는 신호입니다.";
    next = "다음 주 템포런 시간을 5분만 늘려도 괜찮습니다.";
  } else if (isLong) {
    title = "지구력 훈련이 잘 됐어요";
    insight = "거리 자극이 충분했습니다. 오늘 운동의 가치는 속도보다 오래 버틴 힘에 있습니다.";
    next = "다음 운동은 짧고 느리게, 다리를 풀어주는 쪽으로 가세요.";
  } else if (easyDiff > 25 && workout.effort === "easy") {
    title = "조금 더 선명한 자극을 줘도 돼요";
    insight = "운동이 너무 편했다면 다음번 이지런 마지막 10분만 살짝 올려도 됩니다.";
    next = `다음 이지런 후반 10분을 ${paceRange(zones.steady, 8)}로 마무리해 보세요.`;
  }

  if (workout.hasImage) {
    message += " 업로드한 기록 이미지는 저장하지 않고, 입력한 수치와 함께 인사이트 문맥으로만 사용합니다.";
  }

  return { title, message, insight, next };
}

function renderWorkoutInsight(insight) {
  coachResult.innerHTML = `
    <strong>${insight.title}</strong>
    <p>${insight.message}</p>
    <ul>
      <li>${insight.insight}</li>
      <li>${insight.next}</li>
    </ul>
  `;
}

function showPlanError(message) {
  planSummary.textContent = message;
  planInsight.innerHTML = `<strong>입력 확인</strong><span>${message}</span>`;
  planList.innerHTML = "";
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
  const rounded = Math.max(1, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const rest = String(rounded % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function paceRange(center, spread) {
  return `${secondsToPace(center - spread)}~${secondsToPace(center + spread)}/km`;
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
