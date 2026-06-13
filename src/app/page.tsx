"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  doc,
  setDoc,
  getDocs,
  writeBatch,
  deleteDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { calculatePoints } from "@/lib/scoreCalculator";
import { getFlagUrl } from "@/lib/flags";

// Interfaces
interface Match {
  id: string;
  round: string;
  date: string;
  time: string;
  team1: string;
  team2: string;
  group: string | null;
  ground: string;
  num: number;
  result: { goals1: number; goals2: number; isFinal?: boolean } | null;
}

interface Prediction {
  id: string;
  userId: string;
  matchId: string;
  goals1: number;
  goals2: number;
  points: number;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  points: number;
  isAdmin?: boolean;
  groupIds?: string[];
}

interface Group {
  id: string;
  name: string;
  code: string;
  createdAt: any;
  createdBy: string;
  admins?: string[];
}

function getMatchStartDate(match: Match): Date {
  try {
    const timeClean = match.time.replace("UTC", "").trim();
    const parts = timeClean.split(" ");
    const timePart = parts[0]; // "13:00"
    const offsetPart = parts[1] || "-5"; // default offset

    let offsetFormatted = "";
    if (offsetPart.startsWith("-") || offsetPart.startsWith("+")) {
      const sign = offsetPart.substring(0, 1);
      const val = offsetPart.substring(1);
      const valNum = Number(val);
      const hoursStr = String(valNum).padStart(2, "0");
      offsetFormatted = `${sign}${hoursStr}:00`;
    } else {
      const valNum = Number(offsetPart);
      if (!isNaN(valNum)) {
        const sign = valNum >= 0 ? "+" : "-";
        const hoursStr = String(Math.abs(valNum)).padStart(2, "0");
        offsetFormatted = `${sign}${hoursStr}:00`;
      } else {
        offsetFormatted = "-05:00";
      }
    }

    const isoString = `${match.date}T${timePart}:00${offsetFormatted}`;
    const date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date;
    }
  } catch (e) {
    console.error("Error parsing match date:", e);
  }
  return new Date(match.date);
}

function hasMatchStarted(match: Match): boolean {
  if (match.result !== null) {
    return true;
  }
  const startDate = getMatchStartDate(match);
  return Date.now() >= startDate.getTime();
}

function formatMatchDateTimeLocal(match: Match): string {
  const date = getMatchStartDate(match);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} • ${hours}:${minutes}`;
}

function formatRoundName(round: string): string {
  if (!round) return "";
  return round
    .replace(/Matchday\s+(\d+)/gi, "Día $1")
    .replace(/Round of 32/gi, "Ronda de 32")
    .replace(/Round of 16/gi, "Octavos")
    .replace(/Quarter-final/gi, "Cuartos")
    .replace(/Semi-final/gi, "Semifinal")
    .replace(/Match for third place/gi, "Tercer Puesto")
    .replace(/Final/gi, "Final");
}

const getTzAbbreviation = () => {
  try {
    return Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
      .formatToParts(new Date())
      .find(part => part.type === 'timeZoneName')?.value || "";
  } catch (e) {
    return "";
  }
};

const capitalizeFirstLetter = (str: string) => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
};

export default function Home() {
  const {
    user,
    profile,
    loading,
    savedAccounts,
    login,
    signup,
    logout,
    switchAccount,
    removeSavedAccount
  } = useAuth();

  // Ref for scrolling to the members section
  const membersSectionRef = React.useRef<HTMLDivElement>(null);

  // Auth state inputs
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Tabs: 'matches', 'leaderboard', 'admin'
  const [activeTab, setActiveTab] = useState<"matches" | "leaderboard" | "admin">("matches");

  // Data lists
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<{ [matchId: string]: Prediction }>({});
  const [allPredictions, setAllPredictions] = useState<Prediction[]>([]);
  const [leaderboard, setLeaderboard] = useState<UserProfile[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Filter & prediction draft inputs
  const [selectedRound, setSelectedRound] = useState<string>("Todos");
  const [hidePastMatches, setHidePastMatches] = useState(true);
  const [predictionDrafts, setPredictionDrafts] = useState<{ [matchId: string]: { goals1: string; goals2: string } }>({});
  const [savingMatches, setSavingMatches] = useState<{ [matchId: string]: boolean }>({});

  // Admin inputs
  const [adminResults, setAdminResults] = useState<{ [matchId: string]: { goals1: string; goals2: string; isFinal: boolean } }>({});
  const [adminSaving, setAdminSaving] = useState<{ [matchId: string]: boolean }>({});
  const [adminSubTab, setAdminSubTab] = useState<"results" | "predictions" | "groups" | "users">("results");
  const [adminSelectedUserId, setAdminSelectedUserId] = useState<string>("");
  const [adminUserPredictions, setAdminUserPredictions] = useState<{ [matchId: string]: Prediction }>({});
  const [adminUserDrafts, setAdminUserDrafts] = useState<{ [matchId: string]: { goals1: string; goals2: string } }>({});
  const [adminSavingUserPreds, setAdminSavingUserPreds] = useState<{ [matchId: string]: boolean }>({});
  const [adminRecalculating, setAdminRecalculating] = useState(false);
  const [adminSyncing, setAdminSyncing] = useState(false);

  // Groups states
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("global");
  const [inviteGroupCode, setInviteGroupCode] = useState<string | null>(null);
  const [inviteGroup, setInviteGroup] = useState<Group | null>(null);

  // Admin group creation inputs
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupCode, setNewGroupCode] = useState("");
  const [adminGroupSubTab, setAdminGroupSubTab] = useState<"list" | "create">("list");
  const [isJoining, setIsJoining] = useState(false);
  const [adminSelectedGroupId, setAdminSelectedGroupId] = useState<string>("");

  // User profile edit states
  const [showNameRestoreModal, setShowNameRestoreModal] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState("");
  const [updatingOwnName, setUpdatingOwnName] = useState(false);
  const [isManualEditName, setIsManualEditName] = useState(false);

  // Auth Handler
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      if (isRegistering) {
        if (!name.trim()) {
          throw new Error("El nombre es obligatorio");
        }
        await signup(email, password, name.trim());
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      console.error(err);
      let msg = "Ocurrió un error. Revisa tus credenciales.";
      if (err.code === "auth/email-already-in-use") msg = "El correo ya está registrado.";
      if (err.code === "auth/invalid-credential") msg = "Correo o contraseña incorrectos.";
      if (err.code === "auth/weak-password") msg = "La contraseña debe tener al menos 6 caracteres.";
      setAuthError(err.message || msg);
    } finally {
      setAuthLoading(false);
    }
  };

  // Real-time data sync
  useEffect(() => {
    if (!user) return;

    setDataLoading(true);
    setPredictions({});
    setPredictionDrafts({});

    // 1. Sync Matches
    const qMatches = query(collection(db, "matches"), orderBy("num", "asc"));
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      const list: Match[] = [];
      const adminDrafts: { [matchId: string]: { goals1: string; goals2: string; isFinal: boolean } } = {};
      snapshot.forEach((doc) => {
        const m = doc.data() as Match;
        list.push({ ...m, id: doc.id });
        if (m.result) {
          adminDrafts[doc.id] = {
            goals1: String(m.result.goals1),
            goals2: String(m.result.goals2),
            isFinal: m.result.isFinal ?? true
          };
        } else {
          adminDrafts[doc.id] = {
            goals1: "",
            goals2: "",
            isFinal: true
          };
        }
      });
      setMatches(list);
      setAdminResults((prev) => ({ ...prev, ...adminDrafts }));
    });

    // 2. Sync Current User's Predictions
    const qPreds = query(collection(db, "predictions"));
    const unsubPreds = onSnapshot(qPreds, (snapshot) => {
      const userPreds: { [matchId: string]: Prediction } = {};
      const allPredsList: Prediction[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as Prediction;
        allPredsList.push(data);
        if (data.userId === user.uid) {
          userPreds[data.matchId] = data;
        }
      });
      setPredictions(userPreds);
      setAllPredictions(allPredsList);

      // Initialize prediction drafts with existing values
      const drafts: { [matchId: string]: { goals1: string; goals2: string } } = {};
      allPredsList.forEach((data) => {
        if (data.userId === user.uid) {
          drafts[data.matchId] = {
            goals1: String(data.goals1),
            goals2: String(data.goals2),
          };
        }
      });
      setPredictionDrafts(drafts);
    });

    // 3. Sync Leaderboard / Users
    const qUsers = query(collection(db, "users"), orderBy("points", "desc"));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data() as UserProfile);
      });
      setLeaderboard(list);
      setDataLoading(false);
    });

    // 4. Sync Groups
    const qGroups = query(collection(db, "groups"), orderBy("name", "asc"));
    const unsubGroups = onSnapshot(qGroups, (snapshot) => {
      const list: Group[] = [];
      snapshot.forEach((doc) => {
        list.push({ ...doc.data() as Group, id: doc.id });
      });
      setGroups(list);
    });

    return () => {
      unsubMatches();
      unsubPreds();
      unsubUsers();
      unsubGroups();
    };
  }, [user]);



  // Sync selected user's predictions for admin edit
  useEffect(() => {
    if (!user || !profile?.isAdmin || !adminSelectedUserId) {
      setAdminUserPredictions({});
      setAdminUserDrafts({});
      return;
    }

    const qPreds = query(collection(db, "predictions"));
    const unsubAdminUserPreds = onSnapshot(qPreds, (snapshot) => {
      const userPreds: { [matchId: string]: Prediction } = {};
      const drafts: { [matchId: string]: { goals1: string; goals2: string } } = {};

      snapshot.forEach((doc) => {
        const data = doc.data() as Prediction;
        if (data.userId === adminSelectedUserId) {
          userPreds[data.matchId] = data;
          drafts[data.matchId] = {
            goals1: String(data.goals1),
            goals2: String(data.goals2),
          };
        }
      });

      setAdminUserPredictions(userPreds);
      setAdminUserDrafts(drafts);
    });

    return () => {
      unsubAdminUserPreds();
    };
  }, [user, profile?.isAdmin, adminSelectedUserId]);

  // Force non-superadmins to the groups sub-tab when visiting the admin panel
  useEffect(() => {
    if (activeTab === "admin" && !profile?.isAdmin && adminSubTab !== "groups") {
      setAdminSubTab("groups");
    }
  }, [activeTab, profile?.isAdmin, adminSubTab]);

  // Load group query parameter on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const groupCode = params.get("group");
      if (groupCode) {
        setInviteGroupCode(groupCode);
        setIsRegistering(true);
      }
    }
  }, []);

  // Fetch group corresponding to the inviteGroupCode
  useEffect(() => {
    if (!inviteGroupCode) return;
    const q = query(collection(db, "groups"));
    const unsub = onSnapshot(q, (snapshot) => {
      let found: Group | null = null;
      snapshot.forEach((doc) => {
        const g = doc.data() as Group;
        if (g.code === inviteGroupCode) {
          found = { ...g, id: doc.id };
        }
      });
      setInviteGroup(found);
    });
    return () => unsub();
  }, [inviteGroupCode]);

  // Auto-join group if user is authenticated and inviteGroup is loaded
  useEffect(() => {
    if (!user || !profile || !inviteGroup) return;

    const currentGroups = profile.groupIds || [];
    if (!currentGroups.includes(inviteGroup.id)) {
      const updatedGroups = [...currentGroups, inviteGroup.id];
      setDoc(doc(db, "users", user.uid), { groupIds: updatedGroups }, { merge: true })
        .then(() => {
          alert(`¡Te has unido exitosamente al grupo: ${inviteGroup.name}!`);
          setInviteGroupCode(null);
          setInviteGroup(null);
          if (typeof window !== "undefined") {
            const url = new URL(window.location.href);
            url.searchParams.delete("group");
            window.history.replaceState({}, document.title, url.toString());
          }
        })
        .catch(err => {
          console.error("Error joining group:", err);
        });
    } else {
      // Already joined, clear invite state
      setInviteGroupCode(null);
      setInviteGroup(null);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("group");
        window.history.replaceState({}, document.title, url.toString());
      }
    }
  }, [user, profile, inviteGroup]);

  // Scroll to members section when a group is selected to view members
  useEffect(() => {
    if (adminSelectedGroupId) {
      setTimeout(() => {
        membersSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [adminSelectedGroupId]);

  const saveUserPredictionByAdmin = async (matchId: string) => {
    if (!user || !profile?.isAdmin || !adminSelectedUserId) return;
    const draft = adminUserDrafts[matchId];
    if (!draft || draft.goals1 === "" || draft.goals2 === "") return;

    const g1 = parseInt(draft.goals1);
    const g2 = parseInt(draft.goals2);
    if (isNaN(g1) || isNaN(g2)) return;

    setAdminSavingUserPreds(prev => ({ ...prev, [matchId]: true }));
    try {
      const predId = `${adminSelectedUserId}_${matchId}`;
      const match = matches.find(m => m.id === matchId);

      let pts = 0;
      if (match?.result) {
        pts = calculatePoints(g1, g2, match.result.goals1, match.result.goals2);
      }

      await setDoc(doc(db, "predictions", predId), {
        id: predId,
        userId: adminSelectedUserId,
        matchId: matchId,
        goals1: g1,
        goals2: g2,
        points: pts
      });

      const allPredsSnap = await getDocs(collection(db, "predictions"));
      let totalPoints = 0;
      allPredsSnap.forEach((pDoc) => {
        const pred = pDoc.data() as Prediction;
        if (pred.userId === adminSelectedUserId) {
          totalPoints += pred.points || 0;
        }
      });

      await setDoc(doc(db, "users", adminSelectedUserId), {
        points: totalPoints
      }, { merge: true });

    } catch (err) {
      console.error("Error saving user prediction by admin:", err);
      alert("Error al guardar la predicción del usuario.");
    } finally {
      setAdminSavingUserPreds(prev => ({ ...prev, [matchId]: false }));
    }
  };

  // Handle saving prediction
  const savePrediction = async (matchId: string) => {
    if (!user) return;
    const draft = predictionDrafts[matchId];
    if (!draft || draft.goals1 === "" || draft.goals2 === "") return;

    const g1 = parseInt(draft.goals1);
    const g2 = parseInt(draft.goals2);
    if (isNaN(g1) || isNaN(g2)) return;

    setSavingMatches(prev => ({ ...prev, [matchId]: true }));
    try {
      const match = matches.find(m => m.id === matchId);
      if (match && hasMatchStarted(match)) {
        alert("El partido ya ha iniciado o finalizado. No se puede guardar ni modificar el pronóstico.");
        return;
      }

      const predId = `${user.uid}_${matchId}`;
      let pts = 0;
      if (match?.result) {
        pts = calculatePoints(g1, g2, match.result.goals1, match.result.goals2);
      }

      await setDoc(doc(db, "predictions", predId), {
        id: predId,
        userId: user.uid,
        matchId: matchId,
        goals1: g1,
        goals2: g2,
        points: pts
      });
    } catch (err) {
      console.error("Error saving prediction:", err);
    } finally {
      setSavingMatches(prev => ({ ...prev, [matchId]: false }));
    }
  };

  // Admin: Set Match Result and Update Scores
  const saveMatchResult = async (matchId: string) => {
    const draft = adminResults[matchId];
    if (!draft || draft.goals1 === "" || draft.goals2 === "") return;

    const rg1 = parseInt(draft.goals1);
    const rg2 = parseInt(draft.goals2);
    if (isNaN(rg1) || isNaN(rg2)) return;

    setAdminSaving(prev => ({ ...prev, [matchId]: true }));

    try {
      // 1. Update Match Doc
      const matchRef = doc(db, "matches", matchId);
      await setDoc(matchRef, {
        result: { goals1: rg1, goals2: rg2, isFinal: draft.isFinal ?? true }
      }, { merge: true });

      // 2. Fetch all predictions for this match
      const predSnap = await getDocs(collection(db, "predictions"));
      const batch = writeBatch(db);

      const updatedUserIds = new Set<string>();

      predSnap.forEach((pDoc) => {
        const pred = pDoc.data() as Prediction;
        if (pred.matchId === matchId) {
          const pts = calculatePoints(pred.goals1, pred.goals2, rg1, rg2);
          batch.update(doc(db, "predictions", pred.id), { points: pts });
          updatedUserIds.add(pred.userId);
        }
      });

      // Commit predictions updates
      await batch.commit();

      // 3. Recalculate users points
      const allPredsSnap = await getDocs(collection(db, "predictions"));
      const userPointsMap: { [userId: string]: number } = {};

      allPredsSnap.forEach((pDoc) => {
        const pred = pDoc.data() as Prediction;
        if (!userPointsMap[pred.userId]) {
          userPointsMap[pred.userId] = 0;
        }
        userPointsMap[pred.userId] += pred.points || 0;
      });

      // Update users collection
      const userBatch = writeBatch(db);
      Object.keys(userPointsMap).forEach((uid) => {
        if (uid && uid !== "undefined") {
          userBatch.set(doc(db, "users", uid), { points: userPointsMap[uid] }, { merge: true });
        }
      });
      await userBatch.commit();

      alert("Resultado guardado y puntajes recalculados exitosamente.");
    } catch (err) {
      console.error("Error setting match result:", err);
      alert("Error al guardar resultado.");
    } finally {
      setAdminSaving(prev => ({ ...prev, [matchId]: false }));
    }
  };

  const recalculateAllScores = async () => {
    if (adminRecalculating) return;
    const confirmRecalc = window.confirm("¿Estás seguro de que deseas recalcular y actualizar en la base de datos los puntos de todos los usuarios y predicciones? Esto resolverá cualquier descuadre.");
    if (!confirmRecalc) return;

    setAdminRecalculating(true);
    try {
      const matchesSnap = await getDocs(collection(db, "matches"));
      const predsSnap = await getDocs(collection(db, "predictions"));

      const matchesMap: { [id: string]: Match } = {};
      matchesSnap.forEach(doc => {
        matchesMap[doc.id] = { ...doc.data() as Match, id: doc.id };
      });

      const userPointsMap: { [userId: string]: number } = {};
      const batch = writeBatch(db);

      predsSnap.forEach(pDoc => {
        const pred = pDoc.data() as Prediction;
        const match = matchesMap[pred.matchId];

        let pts = 0;
        if (match && match.result) {
          pts = calculatePoints(pred.goals1, pred.goals2, match.result.goals1, match.result.goals2);
        }

        if (pred.points !== pts) {
          batch.update(doc(db, "predictions", pred.id), { points: pts });
        }

        if (!userPointsMap[pred.userId]) {
          userPointsMap[pred.userId] = 0;
        }
        userPointsMap[pred.userId] += pts;
      });

      const usersSnap = await getDocs(collection(db, "users"));
      usersSnap.forEach(uDoc => {
        const uid = uDoc.id;
        if (uid && uid !== "undefined") {
          const pts = userPointsMap[uid] || 0;
          batch.set(doc(db, "users", uid), { points: pts }, { merge: true });
        }
      });

      await batch.commit();
      alert("¡Todos los puntajes de las predicciones y de los usuarios han sido recalculados y guardados con éxito en la base de datos!");
    } catch (err) {
      console.error("Error recalculating all scores:", err);
      alert("Error al recalcular todos los puntajes en Firestore.");
    } finally {
      setAdminRecalculating(false);
    }
  };

  const syncApiMatches = async () => {
    if (adminSyncing) return;
    const confirmSync = window.confirm("¿Deseas sincronizar los marcadores y estados en vivo desde la API oficial en este momento? Esto actualizará partidos iniciados/finalizados y recalculará los puntos.");
    if (!confirmSync) return;

    setAdminSyncing(true);
    try {
      const apiUrl = "https://worldcup26.ir/get/games";
      const apiResponse = await fetch(apiUrl);
      if (!apiResponse.ok) {
        throw new Error(`Error de la API: ${apiResponse.status}`);
      }

      const apiData = await apiResponse.json();
      const apiFixtures = apiData.games || [];

      // Mapeo canónico
      const mapApiTeamToDbTeam = (apiTeam: string) => {
        if (!apiTeam) return "";
        const clean = apiTeam.trim();
        if (clean === "United States") return "USA";
        if (clean === "Democratic Republic of the Congo") return "DR Congo";
        if (clean === "Bosnia and Herzegovina") return "Bosnia & Herzegovina";
        return clean;
      };

      const cleanNameLocal = (name: string) => {
        if (!name) return "";
        let clean = name.toLowerCase().trim();
        if (clean === "usa" || clean === "united states") return "unitedstates";
        if (clean === "dr congo" || clean === "democratic republic of the congo") return "democraticrepublicofthecongo";
        clean = clean.replace(/&/g, "and");
        return clean.replace(/[^a-z0-9]/g, "");
      };

      // Obtener partidos actuales
      const matchesSnap = await getDocs(collection(db, "matches"));
      const dbMatches: Match[] = [];
      matchesSnap.forEach(doc => {
        dbMatches.push({ ...doc.data() as Match, id: doc.id });
      });

      let updatedMatchesCount = 0;
      const batch = writeBatch(db);

      for (const dbMatch of dbMatches) {
        const dbMatchIdNum = parseInt(dbMatch.id, 10);
        let fixture = null;

        if (dbMatchIdNum >= 73) {
          fixture = apiFixtures.find((f: any) => parseInt(f.id, 10) === dbMatchIdNum);
        } else {
          fixture = apiFixtures.find((f: any) => {
            const apiHome = f.home_team_name_en;
            const apiAway = f.away_team_name_en;
            return (
              (cleanNameLocal(apiHome) === cleanNameLocal(dbMatch.team1) && cleanNameLocal(apiAway) === cleanNameLocal(dbMatch.team2)) ||
              (cleanNameLocal(apiHome) === cleanNameLocal(dbMatch.team2) && cleanNameLocal(apiAway) === cleanNameLocal(dbMatch.team1))
            );
          });
        }

        if (!fixture) continue;

        let teamNamesChanged = false;
        let updatedTeam1 = dbMatch.team1;
        let updatedTeam2 = dbMatch.team2;

        if (dbMatchIdNum >= 73 && fixture.home_team_name_en && fixture.away_team_name_en) {
          const mappedHome = mapApiTeamToDbTeam(fixture.home_team_name_en);
          const mappedAway = mapApiTeamToDbTeam(fixture.away_team_name_en);

          if (mappedHome !== dbMatch.team1 || mappedAway !== dbMatch.team2) {
            updatedTeam1 = mappedHome;
            updatedTeam2 = mappedAway;
            teamNamesChanged = true;
          }
        }

        const isFinished = fixture.finished === "TRUE";
        const isStarted = fixture.time_elapsed !== "notstarted";

        let resultChanged = false;
        let newResult = dbMatch.result;

        if (isStarted || isFinished) {
          const goalsHome = parseInt(fixture.home_score, 10);
          const goalsAway = parseInt(fixture.away_score, 10);

          if (!isNaN(goalsHome) && !isNaN(goalsAway)) {
            let realGoals1 = goalsHome;
            let realGoals2 = goalsAway;

            const checkHome = fixture.home_team_name_en || fixture.home_team_label;
            if (checkHome && cleanNameLocal(checkHome) === cleanNameLocal(dbMatch.team2)) {
              realGoals1 = goalsAway;
              realGoals2 = goalsHome;
            }

            newResult = { goals1: realGoals1, goals2: realGoals2, isFinal: isFinished };

            const currentResult = dbMatch.result;
            resultChanged = !currentResult ||
              currentResult.goals1 !== newResult.goals1 ||
              currentResult.goals2 !== newResult.goals2 ||
              currentResult.isFinal !== newResult.isFinal;
          }
        }

        if (resultChanged || teamNamesChanged) {
          const updateData: any = {};
          if (resultChanged) {
            updateData.result = newResult;
          }
          if (teamNamesChanged) {
            updateData.team1 = updatedTeam1;
            updateData.team2 = updatedTeam2;
          }
          batch.update(doc(db, "matches", dbMatch.id), updateData);
          updatedMatchesCount++;

          // Actualizar temporalmente para el cálculo de abajo
          dbMatch.result = newResult;
          dbMatch.team1 = updatedTeam1;
          dbMatch.team2 = updatedTeam2;
        }
      }

      if (updatedMatchesCount > 0) {
        // Ejecutar recalculación completa de puntajes en el mismo batch
        const predsSnap = await getDocs(collection(db, "predictions"));
        const matchesMap: { [id: string]: Match } = {};
        dbMatches.forEach(m => {
          matchesMap[m.id] = m;
        });

        const userPointsMap: { [userId: string]: number } = {};

        predsSnap.forEach(pDoc => {
          const pred = pDoc.data() as Prediction;
          const match = matchesMap[pred.matchId];

          let pts = 0;
          if (match && match.result) {
            pts = calculatePoints(pred.goals1, pred.goals2, match.result.goals1, match.result.goals2);
          }

          if (pred.points !== pts) {
            batch.update(doc(db, "predictions", pred.id), { points: pts });
          }

          if (!userPointsMap[pred.userId]) {
            userPointsMap[pred.userId] = 0;
          }
          userPointsMap[pred.userId] += pts;
        });

        // Actualizar tabla de usuarios
        const usersSnap = await getDocs(collection(db, "users"));
        usersSnap.forEach(uDoc => {
          const uid = uDoc.id;
          if (uid && uid !== "undefined") {
            const pts = userPointsMap[uid] || 0;
            batch.set(doc(db, "users", uid), { points: pts }, { merge: true });
          }
        });

        await batch.commit();
        alert(`Sincronización exitosa. Se actualizaron ${updatedMatchesCount} partidos y se recalcularon todos los puntajes.`);
      } else {
        await batch.commit();
        alert("Sincronización completada. No hubo cambios en los marcadores ni equipos.");
      }
    } catch (err: any) {
      console.error("Error syncing API matches:", err);
      alert(`Error al sincronizar: ${err?.message || err}`);
    } finally {
      setAdminSyncing(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !newGroupCode.trim()) {
      alert("Por favor ingresa el nombre y código del grupo.");
      return;
    }
    if (groups.some(g => g.code === newGroupCode)) {
      alert("El código de grupo ya está en uso.");
      return;
    }
    try {
      const newGroupRef = doc(collection(db, "groups"));
      const newGroup: Group = {
        id: newGroupRef.id,
        name: newGroupName.trim(),
        code: newGroupCode.trim(),
        createdAt: new Date(),
        createdBy: user?.uid || "admin",
        admins: user?.uid ? [user.uid] : ["admin"]
      };
      await setDoc(newGroupRef, newGroup);
      setNewGroupName("");
      setNewGroupCode("");
      alert("Grupo creado exitosamente.");
    } catch (err) {
      console.error("Error creating group:", err);
      alert("Error al crear el grupo.");
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const isUserGroupAdmin = profile?.isAdmin || (user && group.admins?.includes(user.uid));
    if (!isUserGroupAdmin) {
      alert("No tienes permisos para eliminar este grupo.");
      return;
    }

    if (!window.confirm("¿Estás seguro de eliminar este grupo? Los usuarios no serán eliminados pero ya no pertenecerán a este grupo.")) return;
    try {
      await deleteDoc(doc(db, "groups", groupId));
      const usersToUpdate = leaderboard.filter(u => u.groupIds?.includes(groupId));
      const batch = writeBatch(db);
      usersToUpdate.forEach(u => {
        if (u.uid && u.uid !== "undefined") {
          const newGroupIds = u.groupIds?.filter(id => id !== groupId) || [];
          batch.set(doc(db, "users", u.uid), { groupIds: newGroupIds }, { merge: true });
        }
      });
      await batch.commit();
      if (adminSelectedGroupId === groupId) {
        setAdminSelectedGroupId("");
      }
      alert("Grupo eliminado exitosamente.");
    } catch (err) {
      console.error("Error deleting group:", err);
      alert("Error al eliminar el grupo.");
    }
  };

  const handleAddUserToGroup = async (userId: string, groupId: string) => {
    try {
      const userProf = leaderboard.find(u => u.uid === userId);
      if (!userProf) return;
      const currentGroups = userProf.groupIds || [];
      if (!currentGroups.includes(groupId)) {
        const updatedGroups = [...currentGroups, groupId];
        await setDoc(doc(db, "users", userId), { groupIds: updatedGroups }, { merge: true });
        alert("Jugador agregado al grupo.");
      }
    } catch (err) {
      console.error("Error adding user to group:", err);
      alert("Error al agregar jugador al grupo.");
    }
  };

  const handleRemoveUserFromGroup = async (userId: string, groupId: string) => {
    if (!window.confirm("¿Estás seguro de quitar a este jugador del grupo?")) return;
    try {
      const userProf = leaderboard.find(u => u.uid === userId);
      if (!userProf) return;
      const currentGroups = userProf.groupIds || [];
      const updatedGroups = currentGroups.filter(id => id !== groupId);
      await setDoc(doc(db, "users", userId), { groupIds: updatedGroups }, { merge: true });
      alert("Jugador removido del grupo.");
    } catch (err) {
      console.error("Error removing user from group:", err);
      alert("Error al remover jugador del grupo.");
    }
  };

  const handlePromoteToGroupAdmin = async (userId: string, groupId: string) => {
    try {
      const activeGroup = groups.find((g) => g.id === groupId);
      if (!activeGroup) return;
      const currentAdmins = activeGroup.admins || [];
      if (!currentAdmins.includes(userId)) {
        const updatedAdmins = [...currentAdmins, userId];
        await setDoc(doc(db, "groups", groupId), { admins: updatedAdmins }, { merge: true });
        alert("Usuario promovido a administrador del grupo.");
      }
    } catch (err) {
      console.error("Error promoting to group admin:", err);
      alert("Error al promover a administrador del grupo.");
    }
  };

  const handleDemoteFromGroupAdmin = async (userId: string, groupId: string) => {
    try {
      const activeGroup = groups.find((g) => g.id === groupId);
      if (!activeGroup) return;
      const currentAdmins = activeGroup.admins || [];
      if (currentAdmins.includes(userId)) {
        if (currentAdmins.length === 1) {
          alert("Debe haber al menos un administrador en el grupo.");
          return;
        }
        const updatedAdmins = currentAdmins.filter(id => id !== userId);
        await setDoc(doc(db, "groups", groupId), { admins: updatedAdmins }, { merge: true });
        alert("Usuario removido de los administradores del grupo.");
      }
    } catch (err) {
      console.error("Error demoting from group admin:", err);
      alert("Error al remover de los administradores del grupo.");
    }
  };
  const handleForceDeleteUser = async (userId: string) => {
    if (!profile?.isAdmin) return;
    const targetUser = leaderboard.find(u => u.uid === userId);
    if (!targetUser) return;

    if (!window.confirm(`¿Estás absolutamente seguro de eliminar al usuario "${targetUser.displayName}" (${targetUser.email})? Se borrarán sus puntos y todas sus predicciones permanentemente. (El usuario no podrá ingresar ni figurar en la polla).`)) return;

    try {
      const batch = writeBatch(db);
      // Delete user document in users collection
      batch.delete(doc(db, "users", userId));

      // Fetch and delete predictions of this user
      const predsSnap = await getDocs(collection(db, "predictions"));
      predsSnap.forEach((doc) => {
        if (doc.data().userId === userId) {
          batch.delete(doc.ref);
        }
      });

      await batch.commit();
      alert(`Usuario "${targetUser.displayName}" eliminado exitosamente.`);
    } catch (err) {
      console.error("Error deleting user:", err);
      alert("Error al eliminar el usuario.");
    }
  };

  const handleEditUserDisplayName = async (userId: string) => {
    if (!profile?.isAdmin) return;
    const targetUser = leaderboard.find(u => u.uid === userId);
    if (!targetUser) return;

    const newName = window.prompt(`Ingresa el nuevo nombre para el usuario "${targetUser.displayName}":`, targetUser.displayName);
    if (newName === null) return; // User cancelled
    const cleanName = newName.trim();
    if (!cleanName) {
      alert("El nombre no puede estar vacío.");
      return;
    }

    try {
      await setDoc(doc(db, "users", userId), { displayName: cleanName }, { merge: true });
      alert(`Nombre del usuario actualizado a "${cleanName}" exitosamente.`);
    } catch (err) {
      console.error("Error updating display name:", err);
      alert("Error al actualizar el nombre del usuario.");
    }
  };

  // Compute financial metrics dynamically in real-time
  const financialStats = React.useMemo(() => {
    const sortedMatches = [...matches].sort((a, b) => a.num - b.num);

    const stats: {
      [userId: string]: {
        invested: number;
        winnings: number;
        balance: number;
        predictionsCount: number;
      }
    } = {};

    // Ensure all users in leaderboard are initialized
    leaderboard.forEach(u => {
      stats[u.uid] = { invested: 0, winnings: 0, balance: 0, predictionsCount: 0 };
    });

    let rollover = 0;

    sortedMatches.forEach(match => {
      if (!match.result) return;

      const matchPreds = allPredictions.filter(p => p.matchId === match.id);
      if (matchPreds.length === 0) return;

      matchPreds.forEach(pred => {
        if (!stats[pred.userId]) {
          stats[pred.userId] = { invested: 0, winnings: 0, balance: 0, predictionsCount: 0 };
        }
        stats[pred.userId].predictionsCount += 1;
        stats[pred.userId].invested += 500;
      });

      const totalPoolForMatch = (matchPreds.length * 500) + rollover;

      const winners = matchPreds.filter(pred =>
        pred.goals1 === match.result!.goals1 && pred.goals2 === match.result!.goals2
      );

      if (winners.length > 0) {
        const winAmountPerUser = totalPoolForMatch / winners.length;
        winners.forEach(winner => {
          stats[winner.userId].winnings += winAmountPerUser;
        });
        rollover = 0;
      } else {
        rollover = totalPoolForMatch;
      }
    });

    Object.keys(stats).forEach(uid => {
      stats[uid].balance = stats[uid].winnings - stats[uid].invested;
    });

    return { stats, currentRollover: rollover };
  }, [matches, allPredictions, leaderboard]);

  // Filtered leaderboard based on selected group
  const displayedLeaderboard = React.useMemo(() => {
    if (selectedGroupId === "global") {
      return leaderboard;
    }
    return leaderboard.filter((u) => u.groupIds?.includes(selectedGroupId));
  }, [leaderboard, selectedGroupId]);

  // Unique list of rounds for filtering
  const rounds = ["Todos", "Matchday 1", "Matchday 2", "Matchday 3", "Matchday 4", "Matchday 5", "Matchday 6", "Matchday 7", "Matchday 8", "Matchday 9", "Matchday 10", "Matchday 11", "Matchday 12", "Matchday 13", "Matchday 14", "Matchday 15", "Matchday 16", "Matchday 17", "Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Match for third place", "Final"];

  // Sort matches chronologically
  const sortedMatches = React.useMemo(() => {
    return [...matches].sort((a, b) => {
      const dateA = getMatchStartDate(a).getTime();
      const dateB = getMatchStartDate(b).getTime();
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      return a.num - b.num;
    });
  }, [matches]);

  const filteredMatches = selectedRound === "Todos"
    ? sortedMatches
    : sortedMatches.filter(m => m.round === selectedRound);

  const pastMatchesCount = React.useMemo(() => {
    return filteredMatches.filter(hasMatchStarted).length;
  }, [filteredMatches]);

  const userFilteredMatches = React.useMemo(() => {
    if (hidePastMatches) {
      return filteredMatches.filter(m => !hasMatchStarted(m));
    }
    return filteredMatches;
  }, [filteredMatches, hidePastMatches]);

  const userGroupedMatches = React.useMemo(() => {
    const sorted = [...userFilteredMatches].sort((a, b) => {
      const dateA = getMatchStartDate(a).getTime();
      const dateB = getMatchStartDate(b).getTime();
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      return a.num - b.num;
    });

    const groups: { [key: string]: Match[] } = {};
    const groupOrder: string[] = [];

    sorted.forEach((match) => {
      const matchDate = getMatchStartDate(match);
      const label = capitalizeFirstLetter(
        matchDate.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        })
      );
      if (!groups[label]) {
        groups[label] = [];
        groupOrder.push(label);
      }
      groups[label].push(match);
    });

    return groupOrder.map(label => ({
      dateLabel: label,
      matches: groups[label]
    }));
  }, [userFilteredMatches]);

  const groupedMatches = React.useMemo(() => {
    const sorted = [...filteredMatches].sort((a, b) => {
      const dateA = getMatchStartDate(a).getTime();
      const dateB = getMatchStartDate(b).getTime();
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      return a.num - b.num;
    });

    const groups: { [key: string]: Match[] } = {};
    const groupOrder: string[] = [];

    sorted.forEach((match) => {
      const matchDate = getMatchStartDate(match);
      const label = capitalizeFirstLetter(
        matchDate.toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        })
      );
      if (!groups[label]) {
        groups[label] = [];
        groupOrder.push(label);
      }
      groups[label].push(match);
    });

    return groupOrder.map(label => ({
      dateLabel: label,
      matches: groups[label]
    }));
  }, [filteredMatches]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-white p-6">
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-slate-400 font-medium animate-pulse">Cargando polla mundialista...</p>
      </div>
    );
  }

  // Not logged in: Show auth screen
  if (!user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
        <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 rounded-2xl shadow-2xl p-8 transition-all duration-300">
          <div className="text-center mb-8">
            <span className="text-5xl mb-2 block animate-bounce">🏆</span>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 bg-clip-text text-transparent">
              Polla Mundial 2026
            </h1>
            {/* <p className="text-emerald-450 font-extrabold text-xs tracking-wider mt-1.5 uppercase text-emerald-400">
              Amigos
            </p> */}
            <p className="text-slate-400 text-sm mt-2">
              {isRegistering ? "Regístrate para pronosticar los 104 partidos" : "Inicia sesión para ver tu puntaje y pronósticos"}
            </p>
          </div>

          {inviteGroup && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center text-xs text-emerald-450">
              👋 Te han invitado a unirte al grupo: <strong>{inviteGroup.name}</strong>.
              <br />
              <span className="text-slate-400 mt-1 block">Regístrate o inicia sesión abajo para unirte.</span>
            </div>
          )}

          {savedAccounts.length > 0 && !isRegistering && (
            <div className="mb-6 border-b border-slate-800/60 pb-5">
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
                Ingresar con cuenta guardada:
              </span>
              <div className="space-y-2">
                {savedAccounts.map((acc) => (
                  <div
                    key={acc.email}
                    className="flex items-center justify-between p-2.5 bg-slate-950/40 hover:bg-slate-950/80 border border-slate-850 rounded-xl transition-all group"
                  >
                    <button
                      type="button"
                      onClick={async () => {
                        setAuthError("");
                        setAuthLoading(true);
                        try {
                          await switchAccount(acc.email);
                        } catch (err: any) {
                          setAuthError("No se pudo iniciar sesión de forma automática.");
                        } finally {
                          setAuthLoading(false);
                        }
                      }}
                      className="flex-1 text-left flex flex-col"
                    >
                      <span className="font-bold text-xs text-slate-200 group-hover:text-emerald-400 transition-colors">
                        {acc.name}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[200px]">
                        {acc.email}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSavedAccount(acc.email)}
                      className="text-slate-500 hover:text-rose-400 text-xs p-1 transition-colors"
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {isRegistering && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Nombre Completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Cristiano Ronaldo"
                  required
                  className="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-100 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Correo Electrónico</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@correo.com"
                required
                className="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-100 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="******"
                required
                className="w-full px-4 py-3 bg-slate-950/50 border border-slate-800 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-100 transition-colors"
              />
            </div>

            {authError && (
              <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm px-4 py-3 rounded-xl">
                ⚠️ {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-xl shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] transition-all duration-200 flex items-center justify-center disabled:opacity-50"
            >
              {authLoading ? (
                <div className="w-5 h-5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
              ) : isRegistering ? (
                "Crear Cuenta"
              ) : (
                "Ingresar"
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsRegistering(!isRegistering);
                setAuthError("");
              }}
              className="text-emerald-400 hover:text-emerald-300 text-sm font-medium transition-colors"
            >
              {isRegistering ? "¿Ya tienes cuenta? Inicia Sesión" : "¿No tienes cuenta? Regístrate aquí"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Logged in user dashboard
  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-h-screen overflow-x-hidden">
      {/* Header */}
      <header className="bg-slate-900/40 backdrop-blur-md border-b border-slate-900 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🏆</span>
            <div className="hidden sm:flex flex-col">
              <span className="font-extrabold text-base sm:text-lg bg-gradient-to-r from-emerald-400 to-amber-300 bg-clip-text text-transparent leading-none">
                Polla Mundial 2026
              </span>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mt-0.5 leading-none">
                Amigos
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Jugador</span>
              <div className="flex items-center justify-end space-x-1.5">
                <span className="font-semibold text-slate-200">{profile?.displayName}</span>
                <button
                  onClick={() => {
                    if (profile) {
                      setNewDisplayName(profile.displayName || "");
                      setIsManualEditName(true);
                      setShowNameRestoreModal(true);
                    }
                  }}
                  title="Editar mi nombre"
                  className="text-[10px] text-slate-500 hover:text-emerald-400 transition-colors focus:outline-none"
                >
                  ✏️
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-full px-4 py-1.5 flex items-center space-x-1.5">
                <span className="text-amber-400 font-bold">⭐</span>
                <span className="font-extrabold text-emerald-400 text-sm">{profile?.points ?? 0} Pts</span>
              </div>
            </div>

            {savedAccounts.filter(acc => acc.email !== user?.email).length > 0 && (
              <select
                onChange={async (e) => {
                  if (e.target.value) {
                    try {
                      await switchAccount(e.target.value);
                    } catch (err) {
                      alert("Error al cambiar de cuenta");
                    }
                  }
                  e.target.value = "";
                }}
                className="px-2.5 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg border border-slate-750 focus:outline-none cursor-pointer"
                defaultValue=""
              >
                <option value="" disabled>Cambiar Cuenta</option>
                {savedAccounts.filter(acc => acc.email !== user?.email).map(acc => (
                  <option key={acc.email} value={acc.email}>
                    {acc.name}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={logout}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 hover:text-rose-400 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-all active:scale-[0.97]"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col lg:flex-row gap-6">

        {/* Navigation Sidebar / Tabs */}
        <section className="w-full lg:w-64 flex flex-row lg:flex-col gap-2 pb-2 lg:pb-0 shrink-0 lg:h-fit">
          <button
            onClick={() => setActiveTab("matches")}
            className={`flex-1 lg:flex-none lg:w-full px-4 py-3 rounded-xl font-bold text-sm text-center lg:text-left flex items-center justify-center lg:justify-start space-x-2.5 transition-all shrink-0 ${activeTab === "matches"
              ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/10 border-b-2 lg:border-b-0 lg:border-l-4 border-emerald-500 text-emerald-400"
              : "bg-slate-900/40 hover:bg-slate-900/80 text-slate-400 hover:text-slate-200 border-b-2 border-transparent lg:border-b-0"
              }`}
          >
            <span>📅</span>
            <span>Pronósticos</span>
          </button>

          <button
            onClick={() => setActiveTab("leaderboard")}
            className={`flex-1 lg:flex-none lg:w-full px-4 py-3 rounded-xl font-bold text-sm text-center lg:text-left flex items-center justify-center lg:justify-start space-x-2.5 transition-all shrink-0 ${activeTab === "leaderboard"
              ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/10 border-b-2 lg:border-b-0 lg:border-l-4 border-emerald-500 text-emerald-400"
              : "bg-slate-900/40 hover:bg-slate-900/80 text-slate-400 hover:text-slate-200 border-b-2 border-transparent lg:border-b-0"
              }`}
          >
            <span>🏆</span>
            <span>Posiciones</span>
          </button>

          {user && (
            <button
              onClick={() => {
                setActiveTab("admin");
                if (!profile?.isAdmin) {
                  setAdminSubTab("groups");
                }
              }}
              className={`flex-1 lg:flex-none lg:w-full px-4 py-3 rounded-xl font-bold text-sm text-center lg:text-left flex items-center justify-center lg:justify-start space-x-2.5 transition-all shrink-0 ${activeTab === "admin"
                ? "bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border-b-2 lg:border-b-0 lg:border-l-4 border-amber-500 text-amber-400"
                : "bg-slate-900/40 hover:bg-slate-900/80 text-slate-400 hover:text-slate-200 border-b-2 border-transparent lg:border-b-0"
                }`}
            >
              <span>👥</span>
              <span>Grupos / Admin</span>
            </button>
          )}
        </section>

        {/* Content Area */}
        <section className="flex-1">
          {dataLoading ? (
            <div className="h-64 flex flex-col items-center justify-center bg-slate-900/20 rounded-2xl border border-slate-900">
              <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="mt-3 text-slate-500 text-sm animate-pulse">Obteniendo datos de Firebase...</p>
            </div>
          ) : (
            <>
              {/* TAB: PRONÓSTICOS */}
              {activeTab === "matches" && (
                <div className="space-y-6">
                  {/* Round Filter */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-extrabold text-slate-200">Calendario Oficial</h2>
                      <p className="text-slate-400 text-[11px]">Completa tus predicciones del Mundial</p>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-start sm:justify-end">
                      {pastMatchesCount > 0 && (
                        <button
                          onClick={() => setHidePastMatches(!hidePastMatches)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1 shrink-0 ${hidePastMatches
                            ? "bg-emerald-950/30 text-emerald-400 border-emerald-900/40 hover:bg-emerald-900/20"
                            : "bg-slate-900/60 text-slate-300 border-slate-800 hover:bg-slate-800"
                            }`}
                        >
                          {hidePastMatches ? (
                            <>
                              <span className="mr-1">👁️</span> {pastMatchesCount} pasados
                            </>
                          ) : (
                            <>
                              <span>🙈</span> Ocultar
                            </>
                          )}
                        </button>
                      )}

                      <select
                        value={selectedRound}
                        onChange={(e) => setSelectedRound(e.target.value)}
                        className="px-3 py-1.5 bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl focus:outline-none focus:border-emerald-500 w-full sm:w-auto"
                      >
                        {rounds.map((round) => (
                          <option key={round} value={round}>{formatRoundName(round)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Matches Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {userGroupedMatches.length === 0 ? (
                      <div className="col-span-full py-12 text-center text-slate-500 bg-slate-900/10 border border-slate-900/40 rounded-2xl p-6">
                        {pastMatchesCount > 0 && hidePastMatches ? (
                          <>
                            <p className="text-slate-400 text-sm mb-3">Todos los partidos de esta ronda ya comenzaron o finalizaron.</p>
                            <button
                              onClick={() => setHidePastMatches(false)}
                              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-extrabold rounded-xl transition-colors shadow-lg shadow-emerald-500/20"
                            >
                              Ver partidos pasados
                            </button>
                          </>
                        ) : (
                          "No se encontraron partidos para esta ronda."
                        )}
                      </div>
                    ) : (
                      userGroupedMatches.map((group) => (
                        <React.Fragment key={group.dateLabel}>
                          {/* Day Header */}
                          <div className="col-span-full mt-6 first:mt-0 mb-2">
                            <div className="flex items-center space-x-3">
                              <span className="text-[11px] font-extrabold text-emerald-400 uppercase tracking-wider bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800/80 shadow-sm">
                                {group.dateLabel}
                              </span>
                              <div className="h-px bg-slate-900 flex-1"></div>
                            </div>
                          </div>

                          {/* Group Matches */}
                          {group.matches.map((match) => {
                            const pred = predictions[match.id];
                            const draft = predictionDrafts[match.id] || { goals1: "", goals2: "" };
                            const isSaving = savingMatches[match.id];
                            const hasResult = match.result !== null;

                            const matchDate = getMatchStartDate(match);
                            const localTimeStr = matchDate.toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false
                            });
                            const tzAbbr = getTzAbbreviation();

                            return (
                              <div
                                key={match.id}
                                className="bg-slate-900/40 hover:bg-slate-900/60 transition-all border border-slate-900/80 hover:border-slate-800 rounded-2xl p-5 flex flex-col justify-between"
                              >
                                {/* Match Header */}
                                <div className="flex justify-between items-center text-xs text-slate-400 border-b border-slate-950/60 pb-3 mb-4">
                                  <span className="font-bold text-emerald-500">{formatRoundName(match.round)} {match.group ? `• ${match.group}` : ""}</span>
                                  <span className="font-semibold text-slate-300">{localTimeStr} {tzAbbr}</span>
                                </div>

                                {/* Teams and Inputs */}
                                <div className="flex items-center justify-between gap-3 my-4">
                                  {/* Team 1 */}
                                  <div className="flex-1 flex flex-col items-center justify-center space-y-1.5 min-w-0">
                                    {getFlagUrl(match.team1) && (
                                      <img
                                        src={getFlagUrl(match.team1)!}
                                        alt={match.team1}
                                        className="w-8 h-5.5 object-cover rounded-sm shadow-md border border-slate-900 shrink-0"
                                      />
                                    )}
                                    <span className="font-bold text-xs sm:text-sm text-slate-200 text-center w-full break-words">
                                      {match.team1}
                                    </span>
                                  </div>

                                  {/* Prediction / Score inputs */}
                                  <div className="flex items-center space-x-2 shrink-0">
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      value={draft.goals1}
                                      disabled={hasResult || isSaving || hasMatchStarted(match)}
                                      onChange={(e) => {
                                        const val = e.target.value.replace(/[^0-9]/g, "");
                                        setPredictionDrafts(prev => ({
                                          ...prev,
                                          [match.id]: { ...draft, goals1: val }
                                        }));
                                      }}
                                      className="w-12 h-12 text-center bg-slate-950 border border-slate-800 focus:border-emerald-500 text-lg font-extrabold rounded-xl focus:outline-none disabled:opacity-60 disabled:bg-slate-900/30 text-emerald-400"
                                      placeholder="-"
                                    />
                                    <span className="text-slate-655 font-bold">vs</span>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      value={draft.goals2}
                                      disabled={hasResult || isSaving || hasMatchStarted(match)}
                                      onChange={(e) => {
                                        const val = e.target.value.replace(/[^0-9]/g, "");
                                        setPredictionDrafts(prev => ({
                                          ...prev,
                                          [match.id]: { ...draft, goals2: val }
                                        }));
                                      }}
                                      className="w-12 h-12 text-center bg-slate-950 border border-slate-800 focus:border-emerald-500 text-lg font-extrabold rounded-xl focus:outline-none disabled:opacity-60 disabled:bg-slate-900/30 text-emerald-400"
                                      placeholder="-"
                                    />
                                  </div>

                                  {/* Team 2 */}
                                  <div className="flex-1 flex flex-col items-center justify-center space-y-1.5 min-w-0">
                                    {getFlagUrl(match.team2) && (
                                      <img
                                        src={getFlagUrl(match.team2)!}
                                        alt={match.team2}
                                        className="w-8 h-5.5 object-cover rounded-sm shadow-md border border-slate-900 shrink-0"
                                      />
                                    )}
                                    <span className="font-bold text-xs sm:text-sm text-slate-200 text-center w-full break-words">
                                      {match.team2}
                                    </span>
                                  </div>
                                </div>

                                {/* Match Footer */}
                                <div className="mt-4 pt-3 border-t border-slate-950/60 flex items-center justify-between">
                                  <span className="text-[10px] text-slate-500 truncate max-w-[150px]">
                                    {match.ground}
                                  </span>
                                  {hasResult ? (
                                    <div className="flex items-center space-x-2">
                                      <span className="text-xs bg-slate-950 border border-slate-800 text-slate-400 px-2.5 py-1 rounded-lg">
                                        {match.result?.isFinal === false ? "En Vivo: " : "Final: "}{match.result?.goals1} - {match.result?.goals2}
                                      </span>
                                      <span className={`text-xs font-bold px-2 py-1 rounded-lg ${(pred?.points ?? 0) === 5
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                        : (pred?.points ?? 0) === 3
                                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                          : (pred?.points ?? 0) === 2
                                            ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                            : (pred?.points ?? 0) === 1
                                              ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                                              : "bg-slate-800 text-slate-500 border border-transparent"
                                        }`}>
                                        +{pred?.points ?? 0} Pts {match.result?.isFinal === false ? "(Prov.)" : ""}
                                      </span>
                                    </div>
                                  ) : hasMatchStarted(match) ? (
                                    <div className="flex items-center space-x-2">
                                      <span className="text-xs bg-slate-950 border border-slate-800 text-amber-500 px-2.5 py-1 rounded-lg font-bold">
                                        ⚡ En Juego
                                      </span>
                                      {pred ? (
                                        <span className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-400">
                                          Pronóstico: {pred.goals1} - {pred.goals2}
                                        </span>
                                      ) : (
                                        <span className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-950 border border-slate-850/80 text-rose-500">
                                          Sin pronóstico
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => savePrediction(match.id)}
                                      disabled={isSaving || draft.goals1 === "" || draft.goals2 === ""}
                                      className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-850 disabled:text-slate-600 disabled:border-slate-800/80 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md active:scale-[0.95]"
                                    >
                                      {isSaving ? "Guardando..." : pred ? "Actualizar" : "Guardar"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </React.Fragment>
                      ))
                    )}
                  </div>
                </div>
              )}

              {activeTab === "leaderboard" && (
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-950/60 pb-4">
                    <div>
                      <h2 className="text-xl font-extrabold text-slate-200">Tabla de Clasificación</h2>
                      <p className="text-slate-400 text-xs mt-1">Conoce a los mejores pronosticadores de la copa</p>
                    </div>

                    {/* Group Selector Dropdown */}
                    <div className="flex items-center space-x-2 shrink-0">
                      <span className="text-xs font-semibold text-slate-400">Grupo:</span>
                      <select
                        value={selectedGroupId}
                        onChange={(e) => setSelectedGroupId(e.target.value)}
                        className="px-3 py-1.5 bg-slate-950 border border-slate-800 text-slate-350 text-xs font-semibold rounded-xl focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="global">🏆 Global</option>
                        {groups
                          .filter((g) => profile?.isAdmin || profile?.groupIds?.includes(g.id))
                          .map((g) => (
                            <option key={g.id} value={g.id}>👥 {g.name}</option>
                          ))
                        }
                      </select>
                    </div>
                  </div>

                  {selectedGroupId !== "global" && (
                    (() => {
                      const selGroup = groups.find(g => g.id === selectedGroupId);
                      if (!selGroup) return null;
                      const inviteUrl = typeof window !== "undefined"
                        ? `${window.location.origin}${window.location.pathname}?group=${selGroup.code}`
                        : `/?group=${selGroup.code}`;
                      return (
                        <div className="mt-4 bg-blue-500/5 border border-blue-500/20 text-blue-400 text-xs px-4 py-3 rounded-xl flex items-center justify-between gap-4">
                          <span className="truncate">🔗 <strong>Enlace de invitación:</strong> <span className="underline select-all text-blue-300">{inviteUrl}</span></span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(inviteUrl);
                              alert("Enlace de invitación copiado al portapapeles");
                            }}
                            className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-[10px] font-bold uppercase transition-all shrink-0 active:scale-95"
                          >
                            Copiar
                          </button>
                        </div>
                      );
                    })()
                  )}

                  <div className="mt-4 bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 text-xs px-4 py-3 rounded-xl flex items-center space-x-2">
                    <span>🏆 <strong>Premios de la Polla:</strong> Al final del torneo, el pozo total recaudado se repartirá así: 1er Puesto: <strong>60%</strong> • 2do Puesto: <strong>30%</strong> • 3er Puesto: <strong>10%</strong>.</span>
                  </div>

                  <div className="mt-6 max-h-[270px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-950 bg-slate-950/20 scrollbar-thin">
                    <table className="w-full text-left border-collapse min-w-[300px]">
                      <thead className="sticky top-0 bg-slate-950 z-10 border-b border-slate-900">
                        <tr className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                          <th className="py-3 sm:py-4 px-3 sm:px-6 text-center w-16">Pos</th>
                          <th className="py-3 sm:py-4 px-3 sm:px-6">Jugador</th>
                          <th className="py-3 sm:py-4 px-3 sm:px-6 text-right w-24">Puntos</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-950">
                        {displayedLeaderboard.map((userProf, index) => {
                          const isMe = userProf.uid === user.uid;
                          return (
                            <tr
                              key={userProf.uid}
                              className={`text-sm hover:bg-slate-900/20 transition-colors ${isMe ? "bg-emerald-500/5 text-emerald-400 font-bold" : "text-slate-300"
                                }`}
                            >
                              <td className="py-3 sm:py-4 px-3 sm:px-6 text-center font-extrabold">
                                {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1}
                              </td>
                              <td className="py-3 sm:py-4 px-3 sm:px-6 truncate max-w-[150px] sm:max-w-[200px]">
                                <span className="align-middle">{userProf.displayName}</span>
                                {isMe && (
                                  <span className="inline-flex items-center ml-2 space-x-1.5 align-middle">
                                    <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded">Tú</span>
                                    <button
                                      onClick={() => {
                                        setNewDisplayName(profile?.displayName || "");
                                        setIsManualEditName(true);
                                        setShowNameRestoreModal(true);
                                      }}
                                      title="Editar mi nombre"
                                      className="text-xs text-slate-500 hover:text-emerald-400 transition-colors focus:outline-none"
                                    >
                                      ✏️
                                    </button>
                                  </span>
                                )}
                              </td>
                              <td className="py-3 sm:py-4 px-3 sm:px-6 text-right font-extrabold text-emerald-400">
                                {userProf.points}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Scoring System Information */}
                  <div className="mt-8 pt-6 border-t border-slate-800/60">
                    <h3 className="text-base font-bold text-slate-200 flex items-center space-x-2">
                      <span>🎯</span>
                      <span>Sistema de Puntuación</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">Cómo se calculan los puntos de cada partido:</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                      <div className="flex items-start space-x-3 p-5 rounded-xl bg-slate-950/20 hover:bg-slate-950/40 transition-colors border border-slate-900">
                        <span className="text-sm font-bold px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">+5 Pts</span>
                        <div>
                          <h4 className="text-sm font-bold text-slate-300">Marcador Exacto</h4>
                          <p className="text-xs text-slate-500 mt-0.5">Acertar el marcador numérico exacto.</p>
                          <span className="text-[11px] text-emerald-500/80 block mt-1">E.g., Pred: 2-1 | Real: 2-1</span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3 p-5 rounded-xl bg-slate-950/20 hover:bg-slate-950/40 transition-colors border border-slate-900">
                        <span className="text-sm font-bold px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">+3 Pts</span>
                        <div>
                          <h4 className="text-sm font-bold text-slate-300">Resultado y Diferencia</h4>
                          <p className="text-xs text-slate-500 mt-0.5">Acertar ganador/empate y la diferencia de goles.</p>
                          <span className="text-[11px] text-amber-500/80 block mt-1">E.g., Pred: 3-1 | Real: 2-0</span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3 p-5 rounded-xl bg-slate-950/20 hover:bg-slate-950/40 transition-colors border border-slate-900">
                        <span className="text-sm font-bold px-2.5 py-0.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">+2 Pts</span>
                        <div>
                          <h4 className="text-sm font-bold text-slate-300">Solo Resultado</h4>
                          <p className="text-xs text-slate-500 mt-0.5">Acertar ganador o empate con diferencia distinta.</p>
                          <span className="text-[11px] text-blue-500/80 block mt-1">E.g., Pred: 2-1 | Real: 3-0</span>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3 p-5 rounded-xl bg-slate-950/20 hover:bg-slate-950/40 transition-colors border border-slate-900">
                        <span className="text-sm font-bold px-2.5 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">+1 Pt</span>
                        <div>
                          <h4 className="text-sm font-bold text-slate-300">Marcador Parcial</h4>
                          <p className="text-xs text-slate-500 mt-0.5">Acertar solo la cantidad de goles de un equipo.</p>
                          <span className="text-[11px] text-indigo-500/80 block mt-1">E.g., Pred: 1-2 | Real: 1-0</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: ADMIN PANEL */}
              {activeTab === "admin" && user && (
                <div className="space-y-6">
                  {/* Admin Header & Sub-Tabs */}
                  <div className="bg-gradient-to-r from-amber-500/10 to-yellow-500/5 border border-amber-500/20 rounded-2xl p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-extrabold text-amber-400">Panel de Administración</h2>
                        <p className="text-slate-400 text-xs mt-1">
                          {profile?.isAdmin
                            ? "Controla los resultados reales del mundial, ajusta las predicciones de los participantes o gestiona grupos."
                            : "Administra la membresía y parámetros de tus grupos asignados."
                          }
                        </p>
                      </div>
                      {profile?.isAdmin && (
                        <div className="flex flex-col sm:flex-row gap-2 self-start md:self-center">
                          <button
                            onClick={syncApiMatches}
                            disabled={adminSyncing}
                            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-800 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                          >
                            {adminSyncing ? "Sincronizando..." : "⚡ Sincronizar Marcadores API"}
                          </button>
                          <button
                            onClick={recalculateAllScores}
                            disabled={adminRecalculating}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                          >
                            {adminRecalculating ? "Recalculando..." : "🔄 Recalcular Todos los Puntos"}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Sub-Tabs Navigation */}
                    <div className="flex gap-2 mt-4 border-t border-slate-900 pt-4 overflow-x-auto flex-nowrap pb-2 pr-4 scrollbar-none snap-x snap-mandatory">
                      {profile?.isAdmin && (
                        <>
                          <button
                            onClick={() => setAdminSubTab("results")}
                            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all border shrink-0 snap-start ${adminSubTab === "results"
                              ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                              : "bg-slate-950/40 border-slate-900 text-slate-400 hover:text-slate-200"
                              }`}
                          >
                            ⚽ Resultados del Mundial
                          </button>
                          <button
                            onClick={() => setAdminSubTab("predictions")}
                            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all border shrink-0 snap-start ${adminSubTab === "predictions"
                              ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                              : "bg-slate-950/40 border-slate-900 text-slate-400 hover:text-slate-200"
                              }`}
                          >
                            👤 Pronósticos de Jugadores
                          </button>
                          <button
                            onClick={() => setAdminSubTab("users")}
                            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all border shrink-0 snap-start ${adminSubTab === "users"
                              ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                              : "bg-slate-950/40 border-slate-900 text-slate-400 hover:text-slate-200"
                              }`}
                          >
                            🛡️ Gestionar Usuarios
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setAdminSubTab("groups")}
                        className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all border shrink-0 snap-start ${adminSubTab === "groups"
                          ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                          : "bg-slate-950/40 border-slate-900 text-slate-400 hover:text-slate-200"
                          }`}
                      >
                        👥 Administrar Grupos
                      </button>
                      {/* Spacer for horizontal mobile scrolling */}
                      <div className="w-4 shrink-0" />
                    </div>
                  </div>

                  {/* Sub-Tab 1: Results */}
                  {adminSubTab === "results" && (
                    <div className="space-y-4">
                      {/* Round Selector in Admin for convenience */}
                      <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                          <h3 className="font-bold text-slate-200 text-sm">Filtrar por Ronda</h3>
                          <p className="text-slate-400 text-[10px]">Filtra los partidos para registrar marcadores con mayor comodidad</p>
                        </div>
                        <select
                          value={selectedRound}
                          onChange={(e) => setSelectedRound(e.target.value)}
                          className="px-4 py-2 bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-xl focus:outline-none focus:border-amber-500"
                        >
                          {rounds.map((round) => (
                            <option key={round} value={round}>{formatRoundName(round)}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-6">
                        {groupedMatches.length === 0 ? (
                          <div className="py-12 text-center text-slate-500">
                            No se encontraron partidos para esta ronda.
                          </div>
                        ) : (
                          groupedMatches.map((group) => (
                            <React.Fragment key={group.dateLabel}>
                              {/* Day Header */}
                              <div className="mt-6 first:mt-0 mb-2">
                                <div className="flex items-center space-x-3">
                                  <span className="text-[10px] font-extrabold text-amber-500 uppercase tracking-wider bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80 shadow-sm">
                                    {group.dateLabel}
                                  </span>
                                  <div className="h-px bg-slate-900 flex-1"></div>
                                </div>
                              </div>

                              <div className="space-y-4">
                                {group.matches.map((match) => {
                                  const draft = adminResults[match.id] || { goals1: "", goals2: "" };
                                  const isSaving = adminSaving[match.id];

                                  const matchDate = getMatchStartDate(match);
                                  const localTimeStr = matchDate.toLocaleTimeString(undefined, {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    hour12: false
                                  });
                                  const tzAbbr = getTzAbbreviation();

                                  return (
                                    <div
                                      key={match.id}
                                      className="bg-slate-900/40 border border-slate-900/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                                    >
                                      <div className="flex-1">
                                        <span className="text-xs text-amber-500 font-semibold">{formatRoundName(match.round)} • Partido {match.num}</span>
                                        <h3 className="font-bold text-slate-200 mt-0.5 flex items-center space-x-2">
                                          {getFlagUrl(match.team1) && (
                                            <img
                                              src={getFlagUrl(match.team1)!}
                                              alt={match.team1}
                                              className="w-5 h-3.5 object-cover rounded-sm shadow-sm border border-slate-900"
                                            />
                                          )}
                                          <span>{match.team1}</span>
                                          <span className="text-slate-500 font-semibold text-xs">vs</span>
                                          <span>{match.team2}</span>
                                          {getFlagUrl(match.team2) && (
                                            <img
                                              src={getFlagUrl(match.team2)!}
                                              alt={match.team2}
                                              className="w-5 h-3.5 object-cover rounded-sm shadow-sm border border-slate-900"
                                            />
                                          )}
                                        </h3>
                                        <span className="text-[10px] text-slate-500">{match.ground} • {localTimeStr} {tzAbbr}</span>
                                      </div>

                                      <div className="flex items-center space-x-3">
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          value={draft.goals1}
                                          onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9]/g, "");
                                            setAdminResults(prev => ({
                                              ...prev,
                                              [match.id]: { ...draft, goals1: val }
                                            }));
                                          }}
                                          className="w-12 h-10 text-center bg-slate-950 border border-slate-800 focus:border-amber-500 text-md font-bold rounded-lg focus:outline-none text-amber-400"
                                          placeholder={match.result ? String(match.result.goals1) : "-"}
                                        />
                                        <span className="text-slate-600 font-bold">vs</span>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          value={draft.goals2}
                                          onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9]/g, "");
                                            setAdminResults(prev => ({
                                              ...prev,
                                              [match.id]: { ...draft, goals2: val }
                                            }));
                                          }}
                                          className="w-12 h-10 text-center bg-slate-950 border border-slate-800 focus:border-amber-500 text-md font-bold rounded-lg focus:outline-none text-amber-400"
                                          placeholder={match.result ? String(match.result.goals2) : "-"}
                                        />

                                        <label className="flex items-center space-x-1.5 cursor-pointer select-none text-xs text-slate-300">
                                          <input
                                            type="checkbox"
                                            checked={draft.isFinal ?? true}
                                            onChange={(e) => {
                                              setAdminResults(prev => ({
                                                ...prev,
                                                [match.id]: { ...draft, isFinal: e.target.checked }
                                              }));
                                            }}
                                            className="rounded border-slate-800 text-amber-500 focus:ring-amber-500 bg-slate-950 w-4 h-4"
                                          />
                                          <span>Final</span>
                                        </label>

                                        <button
                                          onClick={() => saveMatchResult(match.id)}
                                          disabled={isSaving || draft.goals1 === "" || draft.goals2 === ""}
                                          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-md disabled:opacity-50 transition-all"
                                        >
                                          {isSaving ? "Guardando..." : "Registrar"}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </React.Fragment>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Sub-Tab 2: User Predictions Editing */}
                  {adminSubTab === "predictions" && (
                    <div className="space-y-4">
                      {/* Player and Round Selectors */}
                      <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                        <div className="w-full md:w-auto">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                            Seleccionar Jugador
                          </label>
                          <select
                            value={adminSelectedUserId}
                            onChange={(e) => setAdminSelectedUserId(e.target.value)}
                            className="w-full md:w-64 px-4 py-2.5 bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-xl focus:outline-none focus:border-amber-500"
                          >
                            <option value="">-- Selecciona un jugador --</option>
                            {leaderboard.map((userProf) => (
                              <option key={userProf.uid} value={userProf.uid}>
                                {userProf.displayName} ({userProf.email})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="w-full md:w-auto">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                            Filtrar por Ronda
                          </label>
                          <select
                            value={selectedRound}
                            onChange={(e) => setSelectedRound(e.target.value)}
                            className="w-full md:w-64 px-4 py-2.5 bg-slate-950 border border-slate-800 text-slate-300 text-sm rounded-xl focus:outline-none focus:border-amber-500"
                          >
                            {rounds.map((round) => (
                              <option key={round} value={round}>{formatRoundName(round)}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* User Matches Grid */}
                      {!adminSelectedUserId ? (
                        <div className="text-center py-16 bg-slate-900/20 border border-slate-900/50 rounded-2xl text-slate-500">
                          <span className="text-4xl block mb-2">👤</span>
                          Por favor, selecciona un jugador de la lista superior para visualizar y editar sus pronósticos.
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {groupedMatches.length === 0 ? (
                            <div className="py-12 text-center text-slate-500">
                              No se encontraron partidos para esta ronda.
                            </div>
                          ) : (
                            groupedMatches.map((group) => (
                              <React.Fragment key={group.dateLabel}>
                                {/* Day Header */}
                                <div className="mt-6 first:mt-0 mb-2">
                                  <div className="flex items-center space-x-3">
                                    <span className="text-[10px] font-extrabold text-amber-500 uppercase tracking-wider bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80 shadow-sm">
                                      {group.dateLabel}
                                    </span>
                                    <div className="h-px bg-slate-900 flex-1"></div>
                                  </div>
                                </div>

                                <div className="space-y-4">
                                  {group.matches.map((match) => {
                                    const pred = adminUserPredictions[match.id];
                                    const draft = adminUserDrafts[match.id] || { goals1: "", goals2: "" };
                                    const isSaving = adminSavingUserPreds[match.id];
                                    const hasResult = match.result !== null;

                                    const matchDate = getMatchStartDate(match);
                                    const localTimeStr = matchDate.toLocaleTimeString(undefined, {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: false
                                    });
                                    const tzAbbr = getTzAbbreviation();

                                    return (
                                      <div
                                        key={match.id}
                                        className="bg-slate-900/40 border border-slate-900/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                                      >
                                        {/* Match Team Info */}
                                        <div className="flex-1">
                                          <span className="text-xs text-amber-500 font-semibold">{formatRoundName(match.round)} • Partido {match.num}</span>
                                          <h3 className="font-bold text-slate-200 mt-0.5 flex items-center space-x-2">
                                            {getFlagUrl(match.team1) && (
                                              <img
                                                src={getFlagUrl(match.team1)!}
                                                alt={match.team1}
                                                className="w-5 h-3.5 object-cover rounded-sm shadow-sm border border-slate-900"
                                              />
                                            )}
                                            <span>{match.team1}</span>
                                            <span className="text-slate-500 font-semibold text-xs">vs</span>
                                            <span>{match.team2}</span>
                                            {getFlagUrl(match.team2) && (
                                              <img
                                                src={getFlagUrl(match.team2)!}
                                                alt={match.team2}
                                                className="w-5 h-3.5 object-cover rounded-sm shadow-sm border border-slate-900"
                                              />
                                            )}
                                          </h3>
                                          <div className="flex items-center space-x-2 mt-1">
                                            <span className="text-[10px] text-slate-500">{localTimeStr} {tzAbbr} • {match.ground}</span>
                                            {hasResult && (
                                              <span className="text-[10px] bg-slate-950 border border-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                                Resultado real: {match.result?.goals1} - {match.result?.goals2}
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        {/* Inputs and Save Buttons */}
                                        <div className="flex items-center space-x-3 self-end md:self-center">
                                          <div className="flex items-center space-x-1.5">
                                            <input
                                              type="text"
                                              inputMode="numeric"
                                              pattern="[0-9]*"
                                              value={draft.goals1}
                                              onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9]/g, "");
                                                setAdminUserDrafts(prev => ({
                                                  ...prev,
                                                  [match.id]: { ...draft, goals1: val }
                                                }));
                                              }}
                                              className="w-12 h-10 text-center bg-slate-950 border border-slate-800 focus:border-amber-500 text-md font-bold rounded-lg focus:outline-none text-slate-200"
                                              placeholder={pred ? String(pred.goals1) : "-"}
                                            />
                                            <span className="text-slate-600 font-bold text-xs">vs</span>
                                            <input
                                              type="text"
                                              inputMode="numeric"
                                              pattern="[0-9]*"
                                              value={draft.goals2}
                                              onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9]/g, "");
                                                setAdminUserDrafts(prev => ({
                                                  ...prev,
                                                  [match.id]: { ...draft, goals2: val }
                                                }));
                                              }}
                                              className="w-12 h-10 text-center bg-slate-950 border border-slate-800 focus:border-amber-500 text-md font-bold rounded-lg focus:outline-none text-slate-200"
                                              placeholder={pred ? String(pred.goals2) : "-"}
                                            />
                                          </div>

                                          {/* Points Indicator if match has result */}
                                          {hasResult && pred && (
                                            <span className={`text-xs font-bold px-2 py-1.5 rounded-lg border ${pred.points === 5
                                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                              : pred.points === 3
                                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                                : pred.points === 2
                                                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                  : pred.points === 1
                                                    ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                                    : "bg-slate-800 text-slate-500 border-transparent"
                                              }`}>
                                              +{pred.points} Pts
                                            </span>
                                          )}

                                          <button
                                            onClick={() => saveUserPredictionByAdmin(match.id)}
                                            disabled={isSaving || draft.goals1 === "" || draft.goals2 === ""}
                                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow-md disabled:opacity-50 transition-all"
                                          >
                                            {isSaving ? "Guardando..." : pred ? "Modificar" : "Asignar"}
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </React.Fragment>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {adminSubTab === "groups" && (
                    <div className="space-y-4">
                      {/* Sub-tabs for groups admin: list / create */}
                      <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-4 flex items-center justify-between">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => setAdminGroupSubTab("list")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${adminGroupSubTab === "list"
                              ? "bg-amber-500 text-slate-950"
                              : "bg-slate-950 text-slate-400 hover:text-slate-200"
                              }`}
                          >
                            Listado de Grupos
                          </button>
                          <button
                            onClick={() => setAdminGroupSubTab("create")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${adminGroupSubTab === "create"
                              ? "bg-amber-500 text-slate-950"
                              : "bg-slate-950 text-slate-400 hover:text-slate-200"
                              }`}
                          >
                            + Crear Nuevo Grupo
                          </button>
                        </div>
                      </div>

                      {adminGroupSubTab === "create" && (
                        <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 space-y-4">
                          <h3 className="font-extrabold text-slate-200 text-sm">Crear un Nuevo Grupo</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nombre del Grupo</label>
                              <input
                                type="text"
                                value={newGroupName}
                                onChange={(e) => {
                                  setNewGroupName(e.target.value);
                                  // Auto-generate code
                                  setNewGroupCode(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-"));
                                }}
                                className="w-full px-4 py-2 bg-slate-950 border border-slate-800 text-slate-250 rounded-xl focus:outline-none focus:border-amber-500 text-sm"
                                placeholder="Ej. Amigos de la Oficina"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Código de Invitación (Slug único)</label>
                              <input
                                type="text"
                                value={newGroupCode}
                                onChange={(e) => setNewGroupCode(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-"))}
                                className="w-full px-4 py-2 bg-slate-950 border border-slate-800 text-slate-250 rounded-xl focus:outline-none focus:border-amber-500 text-sm"
                                placeholder="ej-amigos-oficina"
                              />
                            </div>
                          </div>
                          <button
                            onClick={handleCreateGroup}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-md transition-all active:scale-95"
                          >
                            Crear Grupo
                          </button>
                        </div>
                      )}

                      {adminGroupSubTab === "list" && (
                        <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5">
                          <h3 className="font-extrabold text-slate-200 text-sm mb-4">Grupos Existentes</h3>
                          {(() => {
                            const myManagedGroups = groups.filter((g) => profile?.isAdmin || (user && g.admins?.includes(user.uid)));
                            if (myManagedGroups.length === 0) {
                              return (
                                <p className="text-slate-500 text-xs">
                                  No administras ningún grupo todavía. ¡Ve a la pestaña "+ Crear Nuevo Grupo" arriba para crear tu propio grupo y jugar con tus amigos!
                                </p>
                              );
                            }
                            return (
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                                      <th className="py-2 px-3">Nombre</th>
                                      <th className="py-2 px-3">Código</th>
                                      <th className="py-2 px-3 text-right">Acciones</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-900 text-xs text-slate-300">
                                    {myManagedGroups.map((g) => (
                                      <tr key={g.id} className="hover:bg-slate-900/20">
                                        <td className="py-3 px-3 font-semibold">{g.name}</td>
                                        <td className="py-3 px-3 text-slate-400 select-all">{g.code}</td>
                                        <td className="py-3 px-3">
                                          <div className="flex flex-col sm:flex-row justify-end items-end sm:items-center gap-1.5 sm:gap-2">
                                            <button
                                              onClick={() => {
                                                const inviteUrl = typeof window !== "undefined"
                                                  ? `${window.location.origin}${window.location.pathname}?group=${g.code}`
                                                  : `/?group=${g.code}`;
                                                navigator.clipboard.writeText(inviteUrl);
                                                alert(`Enlace de invitación para el grupo "${g.name}" copiado.`);
                                              }}
                                              className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg text-[10px] font-bold text-blue-400 whitespace-nowrap"
                                            >
                                              Copiar Enlace de invitación
                                            </button>
                                            <button
                                              onClick={() => setAdminSelectedGroupId(adminSelectedGroupId === g.id ? "" : g.id)}
                                              className="px-2 py-1 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-750 text-[10px] font-bold text-slate-350 whitespace-nowrap"
                                            >
                                              {adminSelectedGroupId === g.id ? "Ocultar Miembros" : "Ver Miembros"}
                                            </button>
                                            {(profile?.isAdmin || (user && g.admins?.includes(user.uid))) && (
                                              <button
                                                onClick={() => handleDeleteGroup(g.id)}
                                                className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-[10px] font-bold text-rose-400 whitespace-nowrap"
                                              >
                                                Eliminar
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {adminSelectedGroupId && (
                        (() => {
                          const activeGroup = groups.find((g) => g.id === adminSelectedGroupId);
                          const groupMembers = leaderboard.filter((u) => u.groupIds?.includes(adminSelectedGroupId));
                          if (!activeGroup) return null;
                          return (
                            <div ref={membersSectionRef} className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 space-y-4">
                              <div className="flex flex-col gap-3 border-b border-slate-800 pb-3">
                                <div>
                                  <h3 className="font-extrabold text-slate-200 text-sm">Miembros de: {activeGroup.name}</h3>
                                  <p className="text-slate-500 text-[10px]">Total: {groupMembers.length} jugadores</p>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-2 w-full">
                                  <select
                                    id="add-user-select"
                                    className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 text-slate-350 text-sm rounded-lg w-full focus:outline-none focus:border-emerald-500 max-w-full"
                                  >
                                    <option value="">-- Agregar Jugador --</option>
                                    {leaderboard
                                      .filter((u) => !u.groupIds?.includes(adminSelectedGroupId))
                                      .map((u) => (
                                        <option key={u.uid} value={u.uid}>
                                          {u.displayName} ({u.email})
                                        </option>
                                      ))}
                                  </select>
                                  <button
                                    onClick={async () => {
                                      const selectEl = document.getElementById("add-user-select") as HTMLSelectElement;
                                      const userIdToAdd = selectEl?.value;
                                      if (!userIdToAdd) return;
                                      await handleAddUserToGroup(userIdToAdd, adminSelectedGroupId);
                                      selectEl.value = "";
                                    }}
                                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-all whitespace-nowrap"
                                  >
                                    Agregar
                                  </button>
                                </div>
                              </div>

                              {groupMembers.length === 0 ? (
                                <p className="text-slate-500 text-xs">Este grupo no tiene miembros asignados.</p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {groupMembers.map((member) => {
                                    const isGrpAdmin = activeGroup.admins?.includes(member.uid) ?? false;
                                    return (
                                      <div key={member.uid} className="flex justify-between items-center p-2.5 bg-slate-950/40 rounded-xl border border-slate-900/80">
                                        <div className="truncate pr-2">
                                          <p className="font-bold text-slate-250 text-xs flex items-center space-x-1.5">
                                            <span>{member.displayName}</span>
                                            {isGrpAdmin && (
                                              <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1 py-0.2 rounded font-extrabold uppercase">
                                                Admin
                                              </span>
                                            )}
                                          </p>
                                          <p className="text-[10px] text-slate-500">{member.email}</p>
                                        </div>
                                        <div className="flex items-center space-x-1.5 shrink-0">
                                          {isGrpAdmin ? (
                                            <button
                                              onClick={() => handleDemoteFromGroupAdmin(member.uid, activeGroup.id)}
                                              className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 rounded-lg text-[9px] font-bold uppercase transition-colors"
                                            >
                                              Quitar Admin
                                            </button>
                                          ) : (
                                            <button
                                              onClick={() => handlePromoteToGroupAdmin(member.uid, activeGroup.id)}
                                              className="px-2 py-1 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-350 rounded-lg text-[9px] font-bold uppercase transition-colors"
                                            >
                                              Hacer Admin
                                            </button>
                                          )}
                                          <button
                                            onClick={() => handleRemoveUserFromGroup(member.uid, adminSelectedGroupId)}
                                            className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/10 rounded-lg text-[9px] font-bold uppercase transition-colors"
                                          >
                                            Quitar
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  )}

                  {adminSubTab === "users" && profile?.isAdmin && (
                    <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 space-y-4">
                      <h3 className="font-extrabold text-slate-200 text-sm">Gestionar Usuarios Registrados</h3>
                      <p className="text-slate-500 text-xs">Lista completa de participantes en la plataforma. Elimina usuarios no autorizados para quitarlos de la polla y del ranking.</p>

                      <div className="overflow-x-auto rounded-xl border border-slate-950 bg-slate-950/20">
                        <table className="w-full text-left border-collapse min-w-[400px]">
                          <thead>
                            <tr className="bg-slate-900/60 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                              <th className="py-3 px-4">Jugador</th>
                              <th className="py-3 px-4">Correo</th>
                              <th className="py-3 px-4 text-center">Puntos</th>
                              <th className="py-3 px-4 text-right">Acciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-950 text-slate-350 text-xs">
                            {leaderboard.map((u) => {
                              const isMe = u.uid === user?.uid;
                              return (
                                <tr key={u.uid} className="hover:bg-slate-900/20">
                                  <td className="py-3 px-4 font-bold">{u.displayName} {isMe && "(Tú)"}</td>
                                  <td className="py-3 px-4 text-slate-450">{u.email}</td>
                                  <td className="py-3 px-4 text-center font-extrabold text-emerald-400">{u.points}</td>
                                  <td className="py-3 px-4 text-right space-x-2">
                                    <button
                                      onClick={() => handleEditUserDisplayName(u.uid)}
                                      className="px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg text-[10px] font-bold text-indigo-400 uppercase tracking-wide transition-all"
                                    >
                                      Editar Nombre
                                    </button>
                                    <button
                                      onClick={() => handleForceDeleteUser(u.uid)}
                                      disabled={isMe}
                                      className="px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg text-[10px] font-bold text-rose-400 uppercase tracking-wide disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                                    >
                                      Eliminar
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {/* Modal de Disculpas y Actualización de Nombre */}
      {showNameRestoreModal && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pt-20 sm:pt-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <span className="text-4xl">{isManualEditName ? "👤" : "🙏"}</span>
              <h2 className="text-xl font-black text-slate-100 bg-gradient-to-r from-emerald-400 to-amber-300 bg-clip-text text-transparent">
                {isManualEditName ? "Editar mi Nombre" : "¡Mil Disculpas!"}
              </h2>
              <p className="text-xs text-slate-350 leading-relaxed">
                {isManualEditName
                  ? "Actualiza tu nombre de pantalla para que aparezca correctamente en la clasificación."
                  : "Debido a una actualización del sistema, de forma temporal se restablecieron algunos nombres en pantalla y se asignó tu correo."}
              </p>
              {!isManualEditName && (
                <p className="text-xs text-emerald-400 font-bold">
                  Te invitamos a escribir tu nombre real abajo para que todos te reconozcan en la tabla de clasificación.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tu Nombre de Pantalla</label>
              <input
                type="text"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Ej: Juan Pérez"
                className="w-full px-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-slate-100 text-xs transition-colors"
              />
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => {
                  localStorage.setItem("polla_name_restore_alert_shown", "true");
                  setShowNameRestoreModal(false);
                }}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold rounded-xl text-xs transition-all"
              >
                {isManualEditName ? "Cancelar" : "Omitir"}
              </button>
              <button
                onClick={async () => {
                  const clean = newDisplayName.trim();
                  if (!clean) {
                    alert("El nombre no puede estar vacío.");
                    return;
                  }
                  setUpdatingOwnName(true);
                  try {
                    if (user) {
                      await setDoc(doc(db, "users", user.uid), { displayName: clean }, { merge: true });
                      localStorage.setItem("polla_name_restore_alert_shown", "true");
                      setShowNameRestoreModal(false);
                    }
                  } catch (err) {
                    console.error(err);
                    alert("Error al actualizar tu nombre.");
                  } finally {
                    setUpdatingOwnName(false);
                  }
                }}
                disabled={updatingOwnName}
                className="flex-[2] py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-xl text-xs transition-all disabled:opacity-50 flex items-center justify-center"
              >
                {updatingOwnName ? "Guardando..." : "Guardar Nombre"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
