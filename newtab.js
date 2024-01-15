const { createApp, ref, computed, onMounted } = Vue;

browser.storage.local.onChanged.addListener((changes, area) => {
  console.log("Event:", changes);
});

const saveToLocalStorage = (object) =>
  browser.storage.local.set(JSON.parse(JSON.stringify(object)));

const getFromLocalStorage = (key) =>
  browser.storage.local.get(key).then((result) => result[key]);

createApp({
  setup() {
    const main = ref(null);
    const onboardingStep = ref(0);
    const personalKey = ref();
    const personalToken = ref();
    const error = ref();
    const boards = ref([]);
    const lastBoard = ref({});
    const selectedBoardId = ref(0);
    const lists = ref([]);
    const selectedListId = ref(0);
    const cards = ref([]);
    const me = ref({});
    const list = ref({});
    const loadingWhat = ref("");
    const showLoading = ref(false);

    onMounted(() => {
      main.value.style.display = "inline-block";
      setTimeout(() => {
        showLoading.value = true;
      }, 500);
    });

    const prepareRequest = ({ body = {}, pathname }) => {
      if (!personalKey.value || !personalToken.value)
        throw new Error("Missing API key or token");

      const url = new URL("https://api.trello.com");
      url.pathname = pathname;
      const searchParams = new URLSearchParams(body);
      searchParams.set("key", personalKey.value);
      searchParams.set("token", personalToken.value);
      url.search = searchParams.toString();
      return url.toString();
    };

    const fetchRequest = async ({ body = {}, pathname }) => {
      const url = prepareRequest({ body, pathname });
      console.log("Fetching:", url);
      try {
        const response = await fetch(url);
        const json = await response.json();
        return json;
      } catch (error) {
        return null;
      }
    };

    const getMe = async ({ force = false } = {}) => {
      if (!force) {
        const meStorage = await getFromLocalStorage("me");
        if (meStorage) return meStorage;
      }

      loadingWhat.value = "account";
      const json = await fetchRequest({ pathname: "/1/members/me" });
      me.value = json;
      await saveToLocalStorage({
        me: {
          ...json,
          firstname: json.fullName?.split?.(" ")[0],
        },
      });
      loadingWhat.value = "";
      return json;
    };

    const saveCredentials = async () => {
      error.value = "";

      if (!personalKey.value || !personalToken.value) {
        error.value = "Please enter both your personal key and token";
        return;
      } else {
        const me = await getMe();
        if (!me?.id) return (error.value = "Invalid personal key or token");

        await saveToLocalStorage({
          credentials: {
            personalKey: personalKey.value,
            personalToken: personalToken.value,
          },
        });

        onboardingStep.value = 2;

        await retrieveBoards(me.idBoards);
      }
    };

    const retrieveBoards = async (boardIds = []) => {
      if (!boardIds?.length) {
        const me = await getMe();
        if (me.idBoards) boardIds.push(...me.idBoards);
      }

      loadingWhat.value = "boards";
      const promises = boardIds.map((idBoard) =>
        fetchRequest({ pathname: `/1/boards/${idBoard}` })
      );
      const json = await Promise.all(promises);
      loadingWhat.value = "";
      boards.value = json;
      saveToLocalStorage({ boards: json });
      return json;
    };

    const retrieveLists = async (boardId) => {
      loadingWhat.value = "lists";
      const json = await fetchRequest({
        pathname: `/1/boards/${boardId}/lists`,
      });
      loadingWhat.value = "";
      lists.value = json;
      saveToLocalStorage({ lists: json });
      return json;
    };

    const retrieveCards = async (listId) => {
      loadingWhat.value = "cards";
      const json = await fetchRequest({
        pathname: `/1/lists/${listId}/cards`,
      });

      const myCards = me.value.id
        ? json.filter((card) => card.idMembers.includes(me.value.id))
        : json;

      loadingWhat.value = "";
      cards.value = myCards;
      saveToLocalStorage({ cards: myCards });
      return myCards;
    };

    (async () => {
      const credentials = (await getFromLocalStorage("credentials")) || {};
      const meStorage = (await getFromLocalStorage("me")) || {};
      const cardsStorage = (await getFromLocalStorage("cards")) || [];
      const listStorage = (await getFromLocalStorage("list")) || {};

      if (meStorage) me.value = meStorage;
      if (credentials.personalKey) personalKey.value = credentials.personalKey;
      if (credentials.personalToken)
        personalToken.value = credentials.personalToken;
      if (cardsStorage.length) cards.value = cardsStorage;
      if (listStorage) list.value = listStorage;

      // Show cards
      if (list.value.id) {
        onboardingStep.value = 0;
        cards.value = await retrieveCards(list.value.id);

        // Show credentials page
      } else if (!credentials.personalKey || !credentials.personalToken) {
        onboardingStep.value = 1;

        // Show boards
      } else {
        onboardingStep.value = 2;
        await retrieveBoards(me.value.idBoards);
      }
    })();

    const selectBoard = async (boardId) => {
      selectedBoardId.value = boardId;
      onboardingStep.value = 3;
      lastBoard.value = boards.value.find((board) => board.id === boardId);
      await retrieveLists(boardId);
    };

    const selectList = async (listId) => {
      selectedListId.value = listId;
      await retrieveCards(listId);
      const board = lastBoard?.value;
      const currentList = lists.value?.find((list) => list.id === listId) || {};
      list.value = { ...currentList, id: listId, board };
      saveToLocalStorage({ list: { ...currentList, id: listId, board } });
      onboardingStep.value = 0;
    };

    const selectedListName = computed(() => {
      const list = lists.value.find(
        (list) => list.id === (cards.value[0]?.idList || selectedListId.value)
      );
      return list?.name;
    });

    const myCards = computed(() => {
      return cards.value.filter((card) => card.idMembers.includes(me.value.id));
    });

    const reset = async () => {
      const credentials = (await getFromLocalStorage("credentials")) || {};
      browser.storage.local.clear().then(() => {
        saveToLocalStorage({ credentials });
        window.location.reload();
      });
    };

    const logout = () => {
      browser.storage.local.clear().then(() => {
        window.location.reload();
      });
    };

    return {
      onboardingStep,
      selectedBoardId,
      saveCredentials,
      personalKey,
      personalToken,
      error,
      lists,
      list,
      reset,
      logout,
      loadingWhat,
      boards,
      selectBoard,
      selectedListId,
      selectList,
      selectedListName,
      cards,
      myCards,
      main,
      me,
      showLoading,
      lastBoard,
    };
  },
}).mount("#app");

// Add a clock that updates every 5 seconds in .clock
const clock = document.querySelector(".clock");

function updateClock() {
  const today = new Date();
  const hour = today.getHours();
  const minute = today.getMinutes();
  document.getElementById("hour").textContent = hour
    .toString()
    .padStart(2, "0");
  document.getElementById("minute").textContent = minute
    .toString()
    .padStart(2, "0");
}

updateClock();
setInterval(updateClock, 5000);
