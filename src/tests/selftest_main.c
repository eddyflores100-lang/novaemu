/* NovaEmu - binario de autotest: emite JSON con resultados agregados */
#include <stdio.h>

int test_chip8_all(void);
int test_gb_all(void);

int main(void)
{
    int f1, f2;
    printf("{\n  \"suite\": \"novaemu-selftest\",\n  \"version\": \"1.0.0\",\n  \"groups\": [\n");
    fflush(stdout);
    f1 = test_chip8_all();
    f2 = test_gb_all();
    printf("  ],\n");
    printf("  \"failed\": %d,\n  \"all_pass\": %s\n}\n", f1 + f2, (f1 + f2) == 0 ? "true" : "false");
    return (f1 + f2) == 0 ? 0 : 1;
}
