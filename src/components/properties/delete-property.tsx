"use client";
import { ConfirmDelete } from "@/components/common/confirm-delete";
import { deleteProperty } from "@/app/(app)/properties/actions";

export function DeletePropertyButton({ id, title }: { id: string; title: string }) {
  return <ConfirmDelete title={`Usunąć „${title}”?`} description="Usuniemy ofertę i wszystkie jej zdjęcia. Materiały w bibliotece zostaną, ale stracą powiązanie z ofertą." action={() => deleteProperty(id)} label="Usuń ofertę" />;
}
