"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { getAccessTokenFromCookie, getAuthHeader } from "@/app/lib/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8001/v1";

interface UserType {
  user_id: string;
  email: string;
  username: string | null;
  role: string;
  is_active: boolean;
  created_at: string | null;
}

export default function ManageUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchUsers = async () => {
      const token = getAccessTokenFromCookie();
      if (!token) {
        router.replace("/signin");
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/auth/users`, {
          headers: {
            ...getAuthHeader(),
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (active) {
            setUsers(data);
            setLoading(false);
          }
        } else {
          if (res.status === 401 || res.status === 403) {
            if (active) {
              setError("Unauthorized or insufficient privileges to view users.");
              setLoading(false);
            }
          } else {
            if (active) {
              setError(`Gagal mengambil data user (status ${res.status}).`);
              setLoading(false);
            }
          }
        }
      } catch (err) {
        console.error("Gagal mengambil list user:", err);
        if (active) {
          setError("Terjadi kesalahan jaringan.");
          setLoading(false);
        }
      }
    };

    fetchUsers();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <>
      <Breadcrumb pageName="Manage User" />

      <div className="rounded-[10px] border border-stroke bg-white p-4 shadow-1 dark:border-dark-3 dark:bg-gray-dark dark:shadow-card sm:p-7.5">
        <h3 className="mb-6 text-xl font-semibold text-dark dark:text-white">
          User Database Accounts
        </h3>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent" />
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-500/10 p-4 text-center text-sm font-medium text-red-500 dark:bg-red-500/5">
            {error}
          </div>
        ) : users.length === 0 ? (
          <div className="py-10 text-center text-gray-500 dark:text-[#8f8f8a]">
            No users registered in database.
          </div>
        ) : (
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-none bg-[#F7F9FC] dark:bg-dark-2 [&>th]:py-4 [&>th]:text-base [&>th]:text-dark [&>th]:dark:text-white">
                  <TableHead className="xl:pl-7.5">User ID</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email Address</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="xl:pr-7.5">Created At</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.user_id} className="border-[#eee] dark:border-dark-3">
                    <TableCell className="font-mono text-xs text-dark dark:text-white xl:pl-7.5">
                      {u.user_id}
                    </TableCell>

                    <TableCell>
                      <span className="font-medium text-dark dark:text-white">
                        {u.username || "-"}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="text-dark dark:text-white">
                        {u.email}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="capitalize font-medium text-dark dark:text-white">
                        {u.role}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div
                        className={cn(
                          "max-w-fit rounded-full px-3.5 py-1 text-sm font-medium",
                          u.is_active
                            ? "bg-[#219653]/[0.08] text-[#219653]"
                            : "bg-[#D34053]/[0.08] text-[#D34053]"
                        )}
                      >
                        {u.is_active ? "Active" : "Inactive"}
                      </div>
                    </TableCell>

                    <TableCell className="xl:pr-7.5 text-dark dark:text-white">
                      {u.created_at ? dayjs(u.created_at).format("MMM DD, YYYY HH:mm") : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </>
  );
}
