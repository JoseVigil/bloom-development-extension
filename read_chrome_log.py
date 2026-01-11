from collections import deque

path = r"C:\Users\josev\AppData\Local\BloomNucleus\profiles\2d0951d3-677c-4c5c-8b8e-22adbcad8ded\chrome_debug.log"
keyword = "bloom"
before = 5
after = 5

buffer = deque(maxlen=before)
after_count = 0

with open(path, "r", errors="ignore") as f:
    for line in f:
        if after_count > 0:
            print(line.rstrip())
            after_count -= 1
            continue

        if keyword.lower() in line.lower():
            print("----- CONTEXTO -----")
            for l in buffer:
                print(l.rstrip())
            print(line.rstrip())
            after_count = after
            print("--------------------")

        buffer.append(line)
