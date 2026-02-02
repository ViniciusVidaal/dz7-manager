import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../services/firebase";

export const requestApproval = async ({
  collectionName,
  docId,
  proposedData,
  originalData,
  requestedBy,
}) => {
  const approvalsRef = collection(db, "approvals");
  return addDoc(approvalsRef, {
    collection: collectionName,
    docId,
    proposedData,
    originalData,
    requestedBy: requestedBy?.uid || null,
    requestedByName: requestedBy?.name || "",
    status: "pendente",
    createdAt: serverTimestamp(),
  });
};
