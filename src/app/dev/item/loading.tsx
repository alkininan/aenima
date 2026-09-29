/**
 * DELETE BEFORE LAUNCH, with everything else under /dev.
 *
 * The item fixture's boundary, so a held `/dev/item?delay=` shows exactly what
 * `/i/<key>` shows while its reads are in flight: the topbar with its two slots
 * skeletoned, the content's skeleton.
 */
export { default } from "@/app/i/[key]/loading";
