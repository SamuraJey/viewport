# Repository Coverage

[Full report](https://htmlpreview.github.io/?https://github.com/SamuraJey/viewport/blob/python-coverage-comment-action-data/htmlcov/index.html)

| Name                                                    |    Stmts |     Miss |   Branch |   BrPart |   Cover |   Missing |
|-------------------------------------------------------- | -------: | -------: | -------: | -------: | ------: | --------: |
| src/viewport/\_\_init\_\_.py                            |        0 |        0 |        0 |        0 |    100% |           |
| src/viewport/admin/\_\_init\_\_.py                      |        4 |        0 |        0 |        0 |    100% |           |
| src/viewport/admin/application.py                       |       16 |        1 |        4 |        2 |     85% |20, 31-\>33 |
| src/viewport/admin/auth.py                              |       65 |       24 |       14 |        5 |     58% |33, 38-46, 51-52, 64-65, 71, 74, 84-85, 93-94, 100-106 |
| src/viewport/admin/views.py                             |       74 |        0 |        0 |        0 |    100% |           |
| src/viewport/api/\_\_init\_\_.py                        |        0 |        0 |        0 |        0 |    100% |           |
| src/viewport/api/auth.py                                |      125 |       11 |       22 |        4 |     90% |31, 35-36, 129, 133-134, 180-181, 186-188 |
| src/viewport/api/gallery.py                             |      242 |       14 |       70 |       11 |     91% |64-\>70, 126-\>130, 372, 420, 435, 461-462, 475-477, 519, 528-\>531, 534, 538-539, 542, 569 |
| src/viewport/api/photo.py                               |      393 |       76 |      132 |       24 |     79% |59-\>63, 84-85, 87-\>86, 110-113, 161, 174, 291-297, 304, 380-389, 402-423, 425, 466-476, 501, 520-521, 532-535, 539-\>543, 541-\>543, 549-\>551, 555-556, 567, 571-\>564, 579-580, 591-593, 648-651, 705, 708, 715-717, 721, 724, 739-752, 779, 784, 787, 795-797 |
| src/viewport/api/project.py                             |      217 |       19 |       56 |       14 |     87% |138-140, 146, 158, 159-\>166, 195, 209, 257, 258-\>265, 301, 410-411, 452, 456-457, 465-\>468, 496, 514, 527, 531-532 |
| src/viewport/api/public.py                              |      413 |       48 |      150 |       18 |     87% |52-53, 198, 331-332, 347-354, 356-360, 422-451, 459-\>465, 704, 717-718, 723-\>713, 791, 795, 799, 814, 818, 826, 866, 869, 875 |
| src/viewport/api/selection.py                           |      418 |        4 |      132 |        7 |     98% |56-\>61, 146-\>148, 198-\>215, 277, 294, 451, 792 |
| src/viewport/api/sharelink.py                           |      154 |        4 |       28 |        2 |     97% |225-226, 228, 266 |
| src/viewport/api/user.py                                |       45 |        9 |       14 |        5 |     76% |30, 54-55, 58-59, 61-62, 72-73 |
| src/viewport/auth\_metrics.py                           |        7 |        0 |        0 |        0 |    100% |           |
| src/viewport/auth\_utils.py                             |       63 |        3 |       16 |        1 |     95% | 41, 63-64 |
| src/viewport/background\_tasks.py                       |      820 |      191 |      216 |       27 |     74% |108, 131-134, 141-143, 203-204, 206-208, 240, 242, 250-258, 265-\>268, 269-270, 303-305, 376-380, 383-389, 395, 400, 405-\>408, 545-\>548, 585-606, 622-639, 657-659, 665-667, 676-683, 695-696, 705-715, 746-747, 751-755, 771-775, 801, 809, 811, 902-906, 912-914, 932, 947-959, 966-967, 995-1049, 1068-1124, 1138-1140, 1151-1153, 1255, 1263-1280, 1289-\>1315, 1297-1299, 1301-1308, 1362-\>1378, 1423-\>1420, 1447-\>1441 |
| src/viewport/celery\_app.py                             |       20 |        0 |        4 |        1 |     96% |   54-\>63 |
| src/viewport/db\_metrics.py                             |       32 |        1 |        4 |        1 |     94% |        53 |
| src/viewport/dependencies.py                            |       40 |        1 |        4 |        1 |     95% |        73 |
| src/viewport/filename\_utils.py                         |       46 |        2 |       18 |        2 |     94% |    67, 72 |
| src/viewport/gallery\_constants.py                      |        4 |        0 |        0 |        0 |    100% |           |
| src/viewport/logger.py                                  |       24 |        3 |        4 |        0 |     89% | 32-34, 44 |
| src/viewport/logging\_config.py                         |       20 |        0 |        0 |        0 |    100% |           |
| src/viewport/main.py                                    |       87 |        2 |        2 |        1 |     97% |88-\>exit, 162, 168 |
| src/viewport/metrics.py                                 |        3 |        0 |        0 |        0 |    100% |           |
| src/viewport/models/\_\_init\_\_.py                     |        8 |        0 |        0 |        0 |    100% |           |
| src/viewport/models/db.py                               |       18 |        0 |        0 |        0 |    100% |           |
| src/viewport/models/gallery.py                          |       81 |        0 |        2 |        0 |    100% |           |
| src/viewport/models/project.py                          |       28 |        0 |        0 |        0 |    100% |           |
| src/viewport/models/refresh\_token\_session.py          |       20 |        0 |        0 |        0 |    100% |           |
| src/viewport/models/sharelink.py                        |       34 |        0 |        0 |        0 |    100% |           |
| src/viewport/models/sharelink\_analytics.py             |       23 |        0 |        0 |        0 |    100% |           |
| src/viewport/models/sharelink\_selection.py             |       59 |        0 |        0 |        0 |    100% |           |
| src/viewport/models/user.py                             |       23 |        0 |        0 |        0 |    100% |           |
| src/viewport/photo\_rotation.py                         |       17 |        1 |        6 |        1 |     91% |        15 |
| src/viewport/repositories/\_\_init\_\_.py               |        5 |        0 |        0 |        0 |    100% |           |
| src/viewport/repositories/base\_repository.py           |       10 |        0 |        2 |        0 |    100% |           |
| src/viewport/repositories/gallery\_repository.py        |      513 |       40 |      176 |       21 |     91% |45, 63, 96, 99, 105, 112-\>116, 319-320, 322-\>326, 330-337, 347-348, 415-438, 452-457, 493, 520-521, 663, 719-\>717, 802-803, 835, 845-846, 937, 942, 947, 948-\>952, 952-\>957 |
| src/viewport/repositories/gallery\_stats.py             |       16 |        1 |        4 |        1 |     90% |        35 |
| src/viewport/repositories/photo\_query\_helpers.py      |       19 |        0 |        8 |        1 |     96% |   25-\>27 |
| src/viewport/repositories/project\_repository.py        |      351 |       29 |      122 |       23 |     89% |105, 107-\>122, 120, 138, 140, 142, 144, 263, 274-276, 373, 421-\>423, 423-\>426, 431-436, 440-\>442, 448-\>450, 455-467, 505, 520, 541, 583, 606, 665, 748, 753, 754-\>757, 757-\>761 |
| src/viewport/repositories/query\_utils.py               |        5 |        0 |        0 |        0 |    100% |           |
| src/viewport/repositories/refresh\_token\_repository.py |       95 |        0 |       22 |        2 |     98% |228-\>230, 246-\>248 |
| src/viewport/repositories/selection\_repository.py      |      324 |        2 |       64 |        7 |     98% |154-\>159, 292, 381-\>383, 414-\>416, 541, 676-\>678, 699-\>701 |
| src/viewport/repositories/sharelink\_repository.py      |      210 |        6 |       42 |        4 |     96% |32, 279, 410-412, 434-\>436, 517-\>519, 520 |
| src/viewport/repositories/sharelink\_scope\_filters.py  |       10 |        0 |        0 |        0 |    100% |           |
| src/viewport/repositories/user\_repository.py           |      110 |       31 |       30 |       11 |     69% |45, 51-53, 66, 69, 74-78, 83, 96-97, 113, 125, 129, 142, 151, 154-183 |
| src/viewport/rotation\_tasks.py                         |      129 |       10 |       38 |        7 |     90% |44-\>46, 48, 56, 93, 96, 136, 161-162, 174, 180-181 |
| src/viewport/s3\_service.py                             |      446 |      160 |      108 |        9 |     64% |165, 216-\>219, 223, 225, 236-\>239, 272, 385-386, 400-406, 443-500, 576-577, 594-595, 712, 719, 725-740, 790-792, 804-817, 828-837, 851-863, 875-892, 906-913, 930-942, 967-994, 1009-1020, 1033-1035, 1057-1074, 1086-1101, 1115-1135 |
| src/viewport/s3\_utils.py                               |       94 |       18 |       16 |        7 |     77% |60-61, 118-\>121, 122-\>124, 125, 175, 186-188, 198-202, 223-224, 243-244, 258, 270 |
| src/viewport/schemas/auth.py                            |       37 |        0 |        2 |        0 |    100% |           |
| src/viewport/schemas/gallery.py                         |      123 |        1 |        6 |        1 |     98% |       116 |
| src/viewport/schemas/photo.py                           |      150 |        9 |       14 |        3 |     91% |101, 174, 191-193, 223-227 |
| src/viewport/schemas/project.py                         |       98 |        7 |       12 |        6 |     88% |30-31, 52, 64, 66, 78, 80 |
| src/viewport/schemas/public.py                          |       64 |        0 |        0 |        0 |    100% |           |
| src/viewport/schemas/selection.py                       |       57 |        2 |        6 |        2 |     94% |    25, 58 |
| src/viewport/schemas/sharelink.py                       |       80 |        4 |       22 |        4 |     92% |20, 22, 75, 79 |
| src/viewport/selection\_utils.py                        |       16 |        0 |        8 |        0 |    100% |           |
| src/viewport/services/\_\_init\_\_.py                   |        3 |        0 |        0 |        0 |    100% |           |
| src/viewport/services/auth\_rate\_limiter.py            |      294 |        0 |      106 |        0 |    100% |           |
| src/viewport/services/presigned\_cache.py               |      144 |        0 |       32 |        2 |     99% |214-\>213, 319-\>exit |
| src/viewport/services/project\_presence.py              |       48 |        0 |       10 |        1 |     98% |   74-\>72 |
| src/viewport/services/redis\_service.py                 |      277 |        0 |       56 |        2 |     99% |208-\>213, 424-\>422 |
| src/viewport/sharelink\_access.py                       |      152 |        0 |       50 |        0 |    100% |           |
| src/viewport/sharelink\_utils.py                        |       10 |        0 |        4 |        0 |    100% |           |
| src/viewport/task\_utils.py                             |       38 |        3 |        2 |        0 |     92% |     21-23 |
| src/viewport/thumbnail\_tasks.py                        |       15 |        0 |        2 |        0 |    100% |           |
| src/viewport/video\_metrics.py                          |       27 |       10 |        2 |        0 |     59% |54-57, 61, 65, 69, 73, 77-78 |
| src/viewport/zip\_utils.py                              |       71 |        4 |       26 |        4 |     92% |68, 84, 97, 118 |
| **TOTAL**                                               | **7684** |  **751** | **1890** |  **245** | **88%** |           |


## Setup coverage badge

Below are examples of the badges you can use in your main branch `README` file.

### Direct image

[![Coverage badge](https://raw.githubusercontent.com/SamuraJey/viewport/python-coverage-comment-action-data/badge.svg)](https://htmlpreview.github.io/?https://github.com/SamuraJey/viewport/blob/python-coverage-comment-action-data/htmlcov/index.html)

This is the one to use if your repository is private or if you don't want to customize anything.

### [Shields.io](https://shields.io) Json Endpoint

[![Coverage badge](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/SamuraJey/viewport/python-coverage-comment-action-data/endpoint.json)](https://htmlpreview.github.io/?https://github.com/SamuraJey/viewport/blob/python-coverage-comment-action-data/htmlcov/index.html)

Using this one will allow you to [customize](https://shields.io/endpoint) the look of your badge.
It won't work with private repositories. It won't be refreshed more than once per five minutes.

### [Shields.io](https://shields.io) Dynamic Badge

[![Coverage badge](https://img.shields.io/badge/dynamic/json?color=brightgreen&label=coverage&query=%24.message&url=https%3A%2F%2Fraw.githubusercontent.com%2FSamuraJey%2Fviewport%2Fpython-coverage-comment-action-data%2Fendpoint.json)](https://htmlpreview.github.io/?https://github.com/SamuraJey/viewport/blob/python-coverage-comment-action-data/htmlcov/index.html)

This one will always be the same color. It won't work for private repos. I'm not even sure why we included it.

## What is that?

This branch is part of the
[python-coverage-comment-action](https://github.com/marketplace/actions/python-coverage-comment)
GitHub Action. All the files in this branch are automatically generated and may be
overwritten at any moment.