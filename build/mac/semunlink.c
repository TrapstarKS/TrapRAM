// Roblox guards single-instance with a named POSIX semaphore. Unlinking the
// name leaves the running client's handle intact but frees the name, so the
// next client creates its own instead of bailing out.
//
// Build: make -C build/mac

#include <semaphore.h>
#include <stdio.h>
#include <errno.h>

int main(int argc, char **argv) {
  const char *name = argc > 1 ? argv[1] : "/RobloxPlayerUniq";
  if (sem_unlink(name) == 0) return 0;
  if (errno == ENOENT) return 0; // nothing to free is a success for our purpose
  perror("sem_unlink");
  return 1;
}
