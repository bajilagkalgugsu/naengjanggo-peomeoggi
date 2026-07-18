/* ======================================================
   app.js
   냉장고 파먹기 - 통합 로직
   (기존 expiry.js + AI_recipe.html 로직 병합)
====================================================== */

import { GEMINI_API_KEY } from "./config.js";

const STORAGE_KEY = "expiry_food_list";

/* ======================================================
   HTML 요소 참조
====================================================== */

// 이름 모달
const nameModal = document.getElementById("name-modal");
const userNameInput = document.getElementById("user-name-input");
const btnModalSubmit = document.getElementById("btn-modal-submit");
const welcomeName = document.getElementById("welcome-name");

// 페이지 전환
const appTitle = document.getElementById("app-title");
const navItems = document.querySelectorAll(".nav-item");
const pages = document.querySelectorAll(".page");

// 등록 페이지
const imageInput = document.getElementById("imageInput");
const cameraBox = document.getElementById("camera-box");
const previewImage = document.getElementById("previewImage");
const cameraPlaceholder = document.getElementById("camera-placeholder");
const scanButton = document.getElementById("scanButton");
const foodNameField = document.getElementById("food-name-field");
const foodDateField = document.getElementById("food-date-field");
const foodCategoryField = document.getElementById("food-category");
const saveButton = document.getElementById("saveButton");
const nameWarning = document.getElementById("name-warning");

// 홈 페이지
const chartValue = document.getElementById("chart-value");
const chartPlaceholder = document.getElementById("chart-placeholder");
const countSafe = document.getElementById("count-safe");
const countWarning = document.getElementById("count-warning");
const countDanger = document.getElementById("count-danger");
const homeUrgentList = document.getElementById("home-urgent-list");

// 레시피 페이지
const recipeFoodList = document.getElementById("recipe-food-list");
const aiRecipeButton = document.getElementById("aiRecipeButton");
const aiResultCard = document.getElementById("ai-result-card");
const aiResultDisplay = document.getElementById("ai-result-display");

let selectedImageFile = null;
let isAiLoading = false;

/* ======================================================
   1. 사용자 이름 모달
====================================================== */

btnModalSubmit.addEventListener("click", () => {
    const name = userNameInput.value.trim();
    if (!name) {
        alert("이름이나 닉네임을 입력해 주세요!");
        return;
    }
    welcomeName.innerText = name;
    localStorage.setItem("user_name", name);

    nameModal.style.opacity = "0";
    setTimeout(() => {
        nameModal.style.display = "none";
    }, 300);
});

// 이전에 저장된 이름이 있으면 모달 생략
(function initName() {
    const savedName = localStorage.getItem("user_name");
    if (savedName) {
        welcomeName.innerText = savedName;
        nameModal.style.display = "none";
    }
})();

/* ======================================================
   2. 하단 탭 페이지 전환
====================================================== */

navItems.forEach(item => {
    item.addEventListener("click", () => {
        const pageId = item.dataset.page;
        const title = item.dataset.title;

        pages.forEach(page => page.classList.remove("active"));
        document.getElementById("page-" + pageId).classList.add("active");
        appTitle.innerText = title;

        navItems.forEach(nav => nav.classList.remove("active"));
        item.classList.add("active");

        document.querySelector(".app-content").scrollTop = 0;

        // 페이지 들어갈 때마다 최신 데이터로 다시 그리기
        if (pageId === "home") renderHome();
        if (pageId === "recipe") renderRecipeList();
    });
});

/* ======================================================
   3. 사진 선택 (카메라 박스 클릭 -> 파일 선택창)
====================================================== */

cameraBox.addEventListener("click", () => {
    imageInput.click();
});

imageInput.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    selectedImageFile = file;

    previewImage.src = URL.createObjectURL(file);
    previewImage.style.display = "block";
    cameraPlaceholder.style.display = "none";
});

/* ======================================================
   4. Base64 변환
====================================================== */

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/* ======================================================
   5. Gemini Vision API - 사진에서 상품명/유통기한 추출
====================================================== */

async function analyzeImage(file) {
    const base64 = await fileToBase64(file);
    const imageData = base64.split(",")[1];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: `사진 속 식품 정보를 분석해.

상품명과 유통기한을 찾아서
반드시 아래 JSON 형식으로만 출력해.

{
 "product_name":"",
 "expiry_date":"YYYY-MM-DD"
}

유통기한을 찾을 수 없으면
빈 문자열로 작성해.`
                        },
                        {
                            inlineData: {
                                mimeType: file.type,
                                data: imageData
                            }
                        }
                    ]
                }
            ]
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
    }

    const data = await response.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error("AI 응답 없음");

    text = text.replace(/```json/g, "").replace(/```/g, "").trim();

    return JSON.parse(text);
}

/* ======================================================
   5-1. 이름 경고 표시/숨김
====================================================== */

function showNameWarning() {
    nameWarning.style.display = "block";
    foodNameField.classList.add("input-warning");
}

function hideNameWarning() {
    nameWarning.style.display = "none";
    foodNameField.classList.remove("input-warning");
}

// 사용자가 직접 타이핑하면 경고 자동으로 사라짐
foodNameField.addEventListener("input", () => {
    if (foodNameField.value.trim() !== "") {
        hideNameWarning();
    }
});

scanButton.addEventListener("click", async () => {
    if (!selectedImageFile) {
        alert("사진을 먼저 선택해주세요.");
        return;
    }

    scanButton.disabled = true;
    scanButton.innerText = "AI 분석 중...";

    try {
        const result = await analyzeImage(selectedImageFile);
        foodNameField.value = result.product_name ?? "";
        foodDateField.value = result.expiry_date ?? "";

        if (foodNameField.value.trim() === "") {
            showNameWarning();
        } else {
            hideNameWarning();
        }
    } catch (error) {
        console.error(error);
        alert("AI 인식 실패\n콘솔을 확인해주세요.");
    }

    scanButton.disabled = false;
    scanButton.innerText = "🔍 AI로 사진 분석하기";
});

/* ======================================================
   6. LocalStorage 읽기/쓰기
====================================================== */

function getFoods() {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    try {
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function saveFoods(foods) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(foods));
}

/* ======================================================
   7. 식품 저장 (등록 페이지 -> 냉장고에 넣기)
====================================================== */

saveButton.addEventListener("click", () => {
    const productName = foodNameField.value.trim();
    const expiryDate = foodDateField.value;
    const category = foodCategoryField.value;

    if (!productName) {
        showNameWarning();
        alert("상품명이 적혀 있지 않아요! 이름을 직접 적어주세요.");
        return;
    }

    if (!expiryDate) {
        alert("유통기한을 입력해주세요.");
        return;
    }

    const foods = getFoods();

    foods.push({
        id: Date.now(),
        product_name: productName,
        expiry_date: expiryDate,
        category: category,
        registered_at: new Date().toISOString()
    });

    saveFoods(foods);

    // 입력창 초기화
    foodNameField.value = "";
    foodDateField.value = "";
    imageInput.value = "";
    previewImage.src = "";
    previewImage.style.display = "none";
    cameraPlaceholder.style.display = "flex";
    selectedImageFile = null;
    hideNameWarning();

    alert("냉장고 파먹기 목록에 등록되었습니다!");

    renderHome();
    renderRecipeList();
});

/* ======================================================
   8. 남은 날짜 계산 / 상태 분류
====================================================== */

function getRemainingDays(expiryDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target = new Date(expiryDate);
    target.setHours(0, 0, 0, 0);

    const diff = target - today;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function getRemainingText(days) {
    if (days < 0) return "기한 지남";
    if (days === 0) return "D-Day";
    return `D-${days}`;
}

// danger: 3일 이내(지난 것 포함) / warning: 7일 이내 / safe: 그 이상
function getStatusClass(days) {
    if (days <= 3) return "danger";
    if (days <= 7) return "warning";
    return "safe";
}

function sortFoods(foods) {
    foods.sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));
}

/* ======================================================
   9. 홈 화면 렌더링
====================================================== */

function renderHome() {
    const foods = getFoods();
    sortFoods(foods);

    const total = foods.length;
    let safe = 0, warning = 0, danger = 0;

    foods.forEach(food => {
        const days = getRemainingDays(food.expiry_date);
        const status = getStatusClass(days);
        if (status === "safe") safe++;
        else if (status === "warning") warning++;
        else danger++;
    });

    countSafe.innerText = safe;
    countWarning.innerText = warning;
    countDanger.innerText = danger;

    const safePercent = total === 0 ? 100 : Math.round((safe / total) * 100);
    chartValue.innerText = `${safePercent}%`;

    // 도넛 차트 색 비율 갱신 (안전/임박/위험 순서로 conic-gradient 계산)
    if (total === 0) {
        chartPlaceholder.style.background =
            "radial-gradient(circle, #fff 68%, transparent 69%), conic-gradient(#e2e8f0 0% 100%)";
    } else {
        const safeEnd = (safe / total) * 100;
        const warningEnd = safeEnd + (warning / total) * 100;
        chartPlaceholder.style.background =
            `radial-gradient(circle, #fff 68%, transparent 69%), conic-gradient(#3b82f6 0% ${safeEnd}%, #f59e0b ${safeEnd}% ${warningEnd}%, #ef4444 ${warningEnd}% 100%)`;
    }

    // 임박 재료 목록 (7일 이내, 최대 3개)
    homeUrgentList.innerHTML = "";
    const urgentFoods = foods.filter(f => getRemainingDays(f.expiry_date) <= 7).slice(0, 3);

    if (urgentFoods.length === 0) {
        homeUrgentList.innerHTML = `<p class="empty-text">지금 급하게 먹어야 할 재료가 없어요 👍</p>`;
        return;
    }

    urgentFoods.forEach(food => {
        const days = getRemainingDays(food.expiry_date);
        const status = getStatusClass(days);

        const item = document.createElement("div");
        item.className = `status-item ${status === "danger" ? "urgent" : "warning"}`;
        item.innerHTML = `
            <div class="food-info">
                <span class="food-icon">🍽️</span>
                <span class="food-name">${food.product_name}</span>
            </div>
            <span class="${status === "danger" ? "urgent-alert" : "warning-alert"}">${getRemainingText(days)}</span>
        `;
        homeUrgentList.appendChild(item);
    });
}

/* ======================================================
   10. 레시피 페이지 - 임박 Top5 렌더링
====================================================== */

function renderRecipeList() {
    const foods = getFoods();
    sortFoods(foods);

    recipeFoodList.innerHTML = "";

    if (foods.length === 0) {
        recipeFoodList.innerHTML = `<p class="empty-text">등록된 식재료가 없어요. 먼저 재료를 등록해보세요!</p>`;
        return;
    }

    const top5 = foods.slice(0, 5);

    top5.forEach(food => {
        const days = getRemainingDays(food.expiry_date);
        const status = getStatusClass(days);

        const item = document.createElement("div");
        item.className = "food-list-item";
        item.innerHTML = `
            <div class="food-details">
                <span class="food-img-emoji">🍽️</span>
                <div>
                    <p class="food-main-name">${food.product_name}</p>
                    <p class="food-sub-info">${food.expiry_date}</p>
                </div>
            </div>
            <span class="d-day ${status}">${getRemainingText(days)}</span>
            <button class="delete-btn" data-id="${food.id}">삭제</button>
        `;
        recipeFoodList.appendChild(item);
    });
}

recipeFoodList.addEventListener("click", event => {
    if (!event.target.classList.contains("delete-btn")) return;
    const id = Number(event.target.dataset.id);

    const foods = getFoods().filter(food => food.id !== id);
    saveFoods(foods);

    renderRecipeList();
    renderHome();
});

/* ======================================================
   11. AI 레시피 추천 (Gemini 텍스트 생성)
====================================================== */

aiRecipeButton.addEventListener("click", async () => {
    if (isAiLoading) return;

    const foods = getFoods();
    sortFoods(foods);

    if (foods.length === 0) {
        alert("먼저 식재료를 등록해주세요!");
        return;
    }

    isAiLoading = true;
    aiRecipeButton.disabled = true;
    aiResultCard.style.display = "block";
    aiResultDisplay.textContent = "Gemini 요리사가 냉장고 데이터를 분석하고 있습니다...";

    const todayStr = new Date().toISOString().split("T")[0];
    const ingredientString = foods
        .map(f => `${f.product_name}(유통기한: ${f.expiry_date})`)
        .join(", ");

    const prompt = `
    너는 냉장고 파먹기 요리사야.
    오늘 날짜는 ${todayStr}이고 내가 가진 식재료는 [${ingredientString}]이야.
    유통기한이 임박한 재료 위주로 소모할 수 있는 요리 레시피를 2~3개 추천하고 조리법도 친절하게 알려줘.
    `;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [
                    { parts: [{ text: prompt }] }
                ]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        aiResultDisplay.textContent = text ?? "AI 응답을 받지 못했습니다.";
    } catch (error) {
        console.error(error);
        aiResultDisplay.textContent = "서버 요청 중 오류가 발생했습니다. 할당량이 초과되었거나 API 키를 확인해주세요.";
    } finally {
        aiRecipeButton.disabled = false;
        isAiLoading = false;
    }
});

/* ======================================================
   12. 초기 실행
====================================================== */

document.addEventListener("DOMContentLoaded", () => {
    renderHome();
    renderRecipeList();
});