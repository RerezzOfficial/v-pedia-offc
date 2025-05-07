      document.addEventListener('DOMContentLoaded', () => {
          const userProfileApiUrl = '/profile/users';
          const checkUserApiUrl = '/check-user';
          const transferSaldoApiUrl = '/transfer-saldo';
          const mutationHistoryApiUrl = '/history/all'; // Updated endpoint

          const initialLoader = document.getElementById('initial-loader');
          const appContainer = document.querySelector('.app-container');

           const themeToggle = document.getElementById('themeToggle');
           const userDropdown = document.getElementById('userDropdown');
           const userMenuButton = document.getElementById('userMenuButton');
           const scrollTopBtn = document.getElementById('scrollTopBtn');
           const sidebar = document.getElementById('sidebar');
           const overlay = document.getElementById('overlay');
           const sidebarToggle = document.getElementById('sidebarToggle');
           const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
           const mainHeader = document.getElementById('mainHeader');
           const infoBanner = document.getElementById('infoBanner');
           const searchInput = document.getElementById('searchInput');

           const sidebarNav = document.getElementById('sidebarNav');
           const contentSections = document.querySelectorAll('main > section');


          const userBalanceElements = document.querySelectorAll('.user-balance-value');
          const userCoinElements = document.querySelectorAll('.user-coin-value');
          const userVerifyH2hStatusElements = document.querySelectorAll('.user-verify-h2h-status');
          const userVerifyH2hIconElements = document.querySelectorAll('.user-verify-h2h-icon');
          const userFullnameDropdownElements = userDropdown ? userDropdown.querySelectorAll('.user-fullname-dropdown') : [];
          const userBalanceDropdownElements = userDropdown ? userDropdown.querySelectorAll('.user-balance-dropdown') : [];
           const userProfileImageDropdownElements = userDropdown ? userDropdown.querySelectorAll('.user-profile-image-dropdown') : [];
           const userProfileImageHeaderElement = userMenuButton ? userMenuButton.querySelector('img') : null;


          const historyListElement = document.getElementById('historyList');


          const recipientUsernameInput = document.getElementById('recipientUsername');
          const usernameFeedbackElement = document.getElementById('usernameFeedback');
          const recipientInfoElement = document.getElementById('recipientInfo');
          const recipientProfileImageElement = document.getElementById('recipientProfileImage');
          const recipientFullnameElement = document.getElementById('recipientFullname');
          const recipientUsernameDisplayElement = document.getElementById('recipientUsernameDisplay');
          const amountGroupElement = document.getElementById('amountGroup');
          const amountInput = document.getElementById('amount');
          const transferButton = document.getElementById('transferButton');
          const transferForm = document.getElementById('transferForm');
          const transferStatusElement = document.getElementById('transferStatus');

          let foundRecipient = null;


          const mutationTableBodyElement = document.getElementById('mutationTableBody');


          const apiKeyInputs = document.querySelectorAll('.api-key-input');
          const togglePasswordButton = document.querySelector('#api-section .toggle-password');
          const copyApiKeyButton = document.querySelector('.copy-api-key-btn');
          const apiKeyStatusElement = document.querySelector('.api-key-status');


          function formatCurrency(amount) {
              return new Intl.NumberFormat('id-ID', {
                  style: 'currency',
                  currency: 'IDR',
                  minimumFractionDigits: 0
              }).format(amount || 0);
          }

           function formatDate(dateString) {
               if (!dateString) return '';
               try {
                   // Assuming the date string is in ISO 8601 format
                   const date = new Date(dateString);
                   if (isNaN(date)) {
                       console.warn('Invalid date string provided:', dateString);
                       return dateString; // Return original string if invalid
                   }
                   const options = {
                       year: 'numeric',
                       month: 'short',
                       day: 'numeric',
                       hour: '2-digit',
                       minute: '2-digit',
                       second: '2-digit',
                       hour12: false,
                       timeZoneName: 'short' // Or 'UTC' depending on your server's timezone
                   };
                   // Adjust timezone if needed. Example: 'Asia/Jakarta'
                   // options.timeZone = 'Asia/Jakarta';
                   return new Intl.DateTimeFormat('id-ID', options).format(date);
               } catch (e) {
                   console.error('Error formatting date:', dateString, e);
                   return dateString; // Return original string on error
               }
          }

          function renderUserData(user) {
              const formattedSaldo = formatCurrency(user.saldo);
              const isVerified = user.isVerified === true;
               const verifyStatusText = isVerified ? 'Verified' : 'Unverified';
               const verifyIconClass = isVerified ? 'fa-check-circle' : 'fa-times-circle';
               const verifyStatusClass = isVerified ? 'verified' : 'unverified';
               const profileImageUrl = user.profileUrl || 'https://files.catbox.moe/qihase.png';
               const fullname = user.fullname || 'Guest User';
               const coinValue = user.coin !== undefined && user.coin !== null ? user.coin : '0';


              userBalanceElements.forEach(el => el.innerHTML = formattedSaldo);
              userCoinElements.forEach(el => el.innerHTML = coinValue);
              userVerifyH2hStatusElements.forEach(el => el.innerHTML = verifyStatusText);
              userVerifyH2hIconElements.forEach(el => {
                   el.innerHTML = `<i class="fas ${verifyIconClass}"></i>`;
                   el.classList.remove('verified', 'unverified', 'loading-state');
                   el.classList.add(verifyStatusClass);
                    el.style.color = '';
                    el.style.backgroundColor = '';
              });

               userProfileImageDropdownElements.forEach(img => {
                   img.src = profileImageUrl;
                   img.alt = `${fullname} profile`;
               });
               userFullnameDropdownElements.forEach(el => el.textContent = fullname);
               userBalanceDropdownElements.forEach(el => el.textContent = formattedSaldo);

               if (userProfileImageHeaderElement) {
                    userProfileImageHeaderElement.src = profileImageUrl;
                    userProfileImageHeaderElement.alt = `${fullname} profile`;
               }

               if (user.apiKey) {
                   renderApiKey(user.apiKey);
               } else {
                    showApiKeyError('API Key tidak ditemukan dalam data user.');
               }
          }

          function renderHistory(history) {
               if (!historyListElement) return;

               historyListElement.innerHTML = '';

               if (!history || history.length === 0) {
                   const noHistoryItem = document.createElement('li');
                   noHistoryItem.classList.add('history-item');
                   noHistoryItem.innerHTML = '<div class="details">Tidak ada history terbaru.</div>';
                   historyListElement.appendChild(noHistoryItem);
                   return;
               }

               // Assuming history items have a 'tanggal' property for sorting
               const sortedHistory = [...history].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
               const latestHistory = sortedHistory.slice(0, 5); // Show only the latest 5 items

               latestHistory.forEach(item => {
                   const listItem = document.createElement('li');
                   listItem.classList.add('history-item');

                   const amountClass = item.status === 'Sukses' ? 'success' : (item.status === 'Failed' ? 'failed' : 'pending');
                   const formattedNominal = new Intl.NumberFormat('id-ID', {
                       style: 'currency',
                       currency: 'IDR',
                       minimumFractionDigits: 0
                   }).format(Math.abs(item.nominal || 0)).replace('Rp', '').trim();
                   const sign = (item.nominal || 0) >= 0 ? '+' : '-'; // Determine sign based on nominal value

                   const formattedDate = formatDate(item.tanggal);

                   listItem.innerHTML = `
                       <div class="details">
                           <div class="activity">${item.aktivitas || 'Unknown Activity'}</div>
                           <div class="code-date">${item.code || 'No Code'} - ${formattedDate || 'No Date'}</div>
                       </div>
                       <div class="amount ${amountClass}">
                            ${sign}${formattedNominal}
                       </div>
                   `;
                   historyListElement.appendChild(listItem);
               });
          }

          function renderMutationHistory(history) {
               if (!mutationTableBodyElement) return;

               mutationTableBodyElement.innerHTML = '';

               if (!history || history.length === 0) {
                   const noHistoryRow = document.createElement('tr');
                   noHistoryRow.innerHTML = '<td colspan="5" class="mutation-empty">Tidak ada history mutasi yang tersedia.</td>';
                   mutationTableBodyElement.appendChild(noHistoryRow);
                   return;
               }

               // Assuming history items have a 'tanggal' property for sorting
               const sortedHistory = [...history].sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));

               sortedHistory.forEach(item => {
                   const tableRow = document.createElement('tr');

                   const amountClass = item.status === 'Sukses' ? 'success' : (item.status === 'Failed' ? 'danger' : (item.status === 'Pending' ? 'warning' : 'info'));
                   const formattedNominal = new Intl.NumberFormat('id-ID', {
                       style: 'currency',
                       currency: 'IDR',
                       minimumFractionDigits: 0
                   }).format(Math.abs(item.nominal || 0)).replace('Rp', '').trim();
                   const sign = (item.nominal || 0) >= 0 ? '+' : '-'; // Determine sign based on nominal value


                   const statusClass = item.status === 'Sukses' ? 'success' : (item.status === 'Failed' ? 'failed' : (item.status === 'Pending' ? 'pending' : 'processing'));

                   const formattedDate = formatDate(item.tanggal);


                   tableRow.innerHTML = `
                       <td class="date">${formattedDate || 'N/A'}</td>
                       <td class="activity">${item.aktivitas || 'Unknown'}</td>
                       <td>${item.code || 'N/A'}</td>
                       <td class="amount ${amountClass}">${sign}${formattedNominal}</td>
                       <td class="status ${statusClass}">${item.status || 'N/A'}</td>
                   `;
                   mutationTableBodyElement.appendChild(tableRow);
               });
          }


          function renderApiKey(apiKey) {
               apiKeyInputs.forEach(input => {
                   input.value = apiKey || 'API Key tidak tersedia.';
               });

               if (copyApiKeyButton) copyApiKeyButton.disabled = false;

               if (apiKeyStatusElement) {
                   apiKeyStatusElement.style.display = 'none';
               }
          }


          function showUserDataLoading() {
               const loadingHtml = '<div class="loading-state"><i class="fas fa-spinner"></i></div>';
               const loadingIconHtml = '<i class="fas fa-spinner loading-state"></i>';

               userBalanceElements.forEach(el => el.innerHTML = loadingHtml);
               userCoinElements.forEach(el => el.innerHTML = loadingHtml);
               userVerifyH2hStatusElements.forEach(el => el.innerHTML = loadingHtml);
               userVerifyH2hIconElements.forEach(el => {
                   el.innerHTML = loadingIconHtml;
                   el.classList.add('loading-state');
                   el.classList.remove('verified', 'unverified');
                    el.style.color = document.body.classList.contains('dark-mode') ? 'var(--dark-text-secondary)' : 'var(--text-secondary)';
                    el.style.backgroundColor = 'transparent';
               });

               if (historyListElement) historyListElement.innerHTML = '<li class="loading-state"><i class="fas fa-spinner"></i> Loading history...</li>';

               userFullnameDropdownElements.forEach(el => el.textContent = 'Loading...');
               userBalanceDropdownElements.forEach(el => el.textContent = 'Loading...');

               showApiKeyLoading();
          }

           function showMutationLoading() {
               if (mutationTableBodyElement) {
                   mutationTableBodyElement.innerHTML = '<tr><td colspan="5" class="mutation-loading"><i class="fas fa-spinner"></i> Loading mutasi...</td></tr>';
               }
           }

           function showApiKeyLoading() {
               apiKeyInputs.forEach(input => input.value = 'Loading...');
               if (copyApiKeyButton) copyApiKeyButton.disabled = true;
               if (apiKeyStatusElement) {
                   apiKeyStatusElement.textContent = 'Mengambil API Key...';
                   apiKeyStatusElement.classList.remove('success', 'error');
                   apiKeyStatusElement.classList.add('loading');
                   apiKeyStatusElement.style.display = 'block';
               }
           }


          function showUserDataError(message) {
               const errorMessageHtml = `<div class="error-state"><i class="fas fa-exclamation-triangle"></i> ${message}</div>`;
               const errorListItemHtml = `<li class="error-state"><i class="fas fa-exclamation-triangle"></i> ${message}</li>`;
               const errorIconHtml = `<i class="fas fa-exclamation-triangle error-state"></i>`;

               userBalanceElements.forEach(el => el.innerHTML = errorMessageHtml);
               userCoinElements.forEach(el => el.innerHTML = errorMessageHtml);
               userVerifyH2hStatusElements.forEach(el => el.innerHTML = 'Error');
               userVerifyH2hIconElements.forEach(el => {
                   el.innerHTML = errorIconHtml;
                   el.classList.remove('loading-state', 'verified', 'unverified');
                   el.style.color = '';
                   el.style.backgroundColor = '';
               });

               if (historyListElement) historyListElement.innerHTML = errorListItemHtml;

               userFullnameDropdownElements.forEach(el => el.textContent = 'Error');
               userBalanceDropdownElements.forEach(el => el.textContent = 'Error');

               showApiKeyError(message);
          }

           function showMutationError(message) {
               if (mutationTableBodyElement) {
                   mutationTableBodyElement.innerHTML = `<tr><td colspan="5" class="mutation-error"><i class="fas fa-exclamation-triangle"></i> ${message}</td></tr>`;
               }
           }

           function showApiKeyError(message) {
               apiKeyInputs.forEach(input => input.value = 'Error loading API Key.');
               if (copyApiKeyButton) copyApiKeyButton.disabled = true;
               if (apiKeyStatusElement) {
                   apiKeyStatusElement.textContent = message || 'Gagal mengambil API Key.';
                   apiKeyStatusElement.classList.remove('success', 'loading');
                   apiKeyStatusElement.classList.add('error');
                   apiKeyStatusElement.style.display = 'block';
               }
           }


          async function fetchUserData() {
               showUserDataLoading();

              try {
                  const response = await fetch(userProfileApiUrl);

                   if (response.status === 404) {
                       console.error('User data endpoint not found (404).');
                       showUserDataError('Endpoint data user tidak ditemukan (404).');
                       return;
                   }


                  if (!response.ok) {
                       const errorText = await response.text();
                       console.error('HTTP error fetching user data!', response.status, errorText);
                      throw new Error(`Gagal mengambil data user: Status ${response.status}`);
                  }
                  const data = await response.json();

                  if (data.success && data.user) {
                      renderUserData(data.user);
                       // History data is part of user data response
                       if (data.user.history) {
                           renderHistory(data.user.history);
                       } else {
                            renderHistory([]); // Render empty history if not available
                       }

                  } else {
                      console.error('API returned success: false or missing user object for user data', data);
                       showUserDataError(`API error user data: ${data.message || 'Terjadi kesalahan dari server atau data user tidak lengkap.'}`);
                       if (!data.user || !data.user.apiKey) {
                            showApiKeyError('API Key tidak ditemukan dalam respons.');
                       }
                  }
              } catch (error) {
                  console.error('Error fetching user data:', error);
                  showUserDataError(`Gagal terhubung ke server (User Data): ${error.message}`);
                   showApiKeyError(`Gagal terhubung ke server (API Key): ${error.message}`);
              } finally {
                  if (initialLoader) {
                       initialLoader.style.opacity = '0';
                       setTimeout(() => {
                           initialLoader.style.display = 'none';
                           if (appContainer) {
                               appContainer.classList.add('loaded');
                           }
                       }, 500);
                   } else {
                       if (appContainer) {
                          appContainer.classList.add('loaded');
                       }
                   }
              }
          }

          async function fetchMutationHistory() {
               showMutationLoading();

               try {
                   const response = await fetch(mutationHistoryApiUrl);

                   if (response.status === 404) {
                       console.warn('Mutation history endpoint not found (404).');
                       showMutationError('Endpoint mutasi tidak ditemukan (404).');
                       return;
                   }


                   if (!response.ok) {
                        const errorText = await response.text();
                        console.error('HTTP error fetching mutation history!', response.status, errorText);
                       throw new Error(`Gagal mengambil mutasi: Status ${response.status}`);
                   }
                   const data = await response.json();

                   // Check the structure based on the provided example
                   if (data.success && Array.isArray(data.history)) {
                       renderMutationHistory(data.history);
                   } else {
                       console.error('API returned success: false or missing history array for mutation history', data);
                        showMutationError(`API error mutasi: ${data.message || 'Terjadi kesalahan dari server atau data mutasi tidak lengkap.'}`);
                   }
               } catch (error) {
                   console.error('Error fetching mutation history:', error);
                   showMutationError(`Gagal terhubung ke server (Mutasi): ${error.message}`);
               }
          }

          function showSection(sectionId) {
               contentSections.forEach(section => {
                   section.classList.remove('active-content');
               });

               const targetSection = document.getElementById(sectionId);
               if (targetSection) {
                   targetSection.classList.add('active-content');
                   history.pushState({ section: sectionId }, '', `#${sectionId}`);
               } else {
                    console.error(`Section with ID ${sectionId} not found. Showing dashboard.`);
                    const defaultSection = document.getElementById('dashboard-summary');
                    if (defaultSection) {
                        defaultSection.classList.add('active-content');
                         history.pushState({ section: 'dashboard-summary' }, '', '#dashboard-summary');
                    }
               }

               if (sidebarNav) {
                   sidebarNav.querySelectorAll('a').forEach(link => {
                       const href = link.getAttribute('href');
                        // Only activate links that are internal section links
                       if (href && href.startsWith('#')) {
                           if (href === `#${sectionId}`) {
                               link.classList.add('active');
                           } else {
                               link.classList.remove('active');
                           }
                       } else {
                           // For external links, ensure they are not marked active
                           link.classList.remove('active');
                       }
                   });
               }

               window.scrollTo({ top: 0, behavior: 'smooth' });

               if (sectionId !== 'transfer-section' && transferForm) {
                   resetTransferForm();
               }

               if (sectionId === 'mutation-section') {
                    fetchMutationHistory();
               }
          }


          if (sidebarNav) {
               sidebarNav.querySelectorAll('a').forEach(link => {
                   link.addEventListener('click', (event) => {
                       const href = link.getAttribute('href');
                       if (href && href.startsWith('#')) {
                           event.preventDefault();
                           const sectionId = href.substring(1);
                           showSection(sectionId);
                           if (window.innerWidth <= 768) {
                                toggleSidebar();
                           }
                       }
                        // For external links, default behavior is fine (open in new tab if target="_blank")
                   });
               });
          }

          window.addEventListener('popstate', (event) => {
               const sectionId = event.state ? event.state.section : (window.location.hash ? window.location.hash.substring(1) : 'dashboard-summary');
               showSection(sectionId);
          });

          const initialSectionId = window.location.hash ? window.location.hash.substring(1) : 'dashboard-summary';
          showSection(initialSectionId);


          function resetTransferForm() {
              if (recipientUsernameInput) recipientUsernameInput.value = '';
              if (usernameFeedbackElement) {
                  usernameFeedbackElement.textContent = '';
                  usernameFeedbackElement.classList.remove('success', 'error', 'loading');
              }
              if (recipientInfoElement) recipientInfoElement.style.display = 'none';
              if (amountGroupElement) amountGroupElement.style.display = 'none';
              if (transferButton) transferButton.disabled = true;
              if (amountInput) amountInput.value = '';
              foundRecipient = null;
              if (transferStatusElement) {
                  transferStatusElement.style.display = 'none';
                  transferStatusElement.classList.remove('success', 'error', 'loading');
                  transferStatusElement.textContent = '';
              }
          }

          if (recipientUsernameInput) {
              recipientUsernameInput.addEventListener('input', debounce(async () => {
                  const username = recipientUsernameInput.value.trim();
                  if (usernameFeedbackElement) {
                      usernameFeedbackElement.textContent = '';
                      usernameFeedbackElement.classList.remove('success', 'error', 'loading');
                  }
                  if (recipientInfoElement) recipientInfoElement.style.display = 'none';
                  if (amountGroupElement) amountGroupElement.style.display = 'none';
                  if (transferButton) transferButton.disabled = true;
                  if (transferStatusElement) transferStatusElement.style.display = 'none';


                  if (username.length < 3) {
                      if (usernameFeedbackElement) usernameFeedbackElement.textContent = 'Ketik minimal 3 karakter username.';
                      return;
                  }

                  if (usernameFeedbackElement) {
                       usernameFeedbackElement.textContent = 'Mengecek username...';
                       usernameFeedbackElement.classList.remove('success', 'error');
                       usernameFeedbackElement.classList.add('loading');
                  }


                  try {
                      const response = await fetch(checkUserApiUrl, {
                          method: 'POST',
                          headers: {
                              'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ username }),
                      });

                      const data = await response.json();

                      if (usernameFeedbackElement) usernameFeedbackElement.classList.remove('loading');

                      if (data.success && data.user) { // Check if data.user exists
                          foundRecipient = data.user;
                           if (usernameFeedbackElement) {
                               usernameFeedbackElement.textContent = `User ditemukan: ${foundRecipient.fullname || foundRecipient.username}`; // Use username as fallback
                               usernameFeedbackElement.classList.remove('error');
                               usernameFeedbackElement.classList.add('success');
                           }

                          if (recipientProfileImageElement) recipientProfileImageElement.src = foundRecipient.profileUrl || 'https://files.catbox.moe/qihase.png';
                          if (recipientFullnameElement) recipientFullnameElement.textContent = foundRecipient.fullname || 'Nama Tidak Diketahui';
                          if (recipientUsernameDisplayElement) recipientUsernameDisplayElement.textContent = `@${foundRecipient.username}`;
                          if (recipientInfoElement) recipientInfoElement.style.display = 'flex';

                          if (amountGroupElement) amountGroupElement.style.display = 'flex';
                          if (transferButton) transferButton.disabled = false;

                      } else {
                          foundRecipient = null;
                          if (usernameFeedbackElement) {
                              usernameFeedbackElement.textContent = data.message || 'User tidak ditemukan.';
                              usernameFeedbackElement.classList.remove('success');
                              usernameFeedbackElement.classList.add('error');
                          }

                          if (recipientInfoElement) recipientInfoElement.style.display = 'none';
                          if (amountGroupElement) amountGroupElement.style.display = 'none';
                          if (transferButton) transferButton.disabled = true;
                      }

                  } catch (error) {
                      console.error('Error checking user:', error);
                      if (usernameFeedbackElement) {
                           usernameFeedbackElement.textContent = 'Gagal mengecek user. Coba lagi.';
                           usernameFeedbackElement.classList.remove('success');
                           usernameFeedbackElement.classList.add('error');
                      }

                      foundRecipient = null;
                      if (recipientInfoElement) recipientInfoElement.style.display = 'none';
                      if (amountGroupElement) amountGroupElement.style.display = 'none';
                      if (transferButton) transferButton.disabled = true;
                  }
              }, 300));
          }

          function debounce(func, delay) {
              let timeoutId;
              return function(...args) {
                  clearTimeout(timeoutId);
                  timeoutId = setTimeout(() => {
                      func.apply(this, args);
                  }, delay);
              };
          }

          if (transferForm) {
              transferForm.addEventListener('submit', async (event) => {
                  event.preventDefault();

                  if (!foundRecipient) {
                       if (transferStatusElement) {
                          transferStatusElement.textContent = 'User penerima belum ditemukan.';
                          transferStatusElement.classList.add('error');
                          transferStatusElement.style.display = 'block';
                       }
                      return;
                  }

                  const amount = amountInput ? parseInt(amountInput.value, 10) : NaN;

                  if (isNaN(amount) || amount < 1000) {
                       if (transferStatusElement) {
                          transferStatusElement.textContent = 'Nominal transfer tidak valid (minimal Rp 1.000).';
                          transferStatusElement.classList.add('error');
                          transferStatusElement.style.display = 'block';
                       }
                      return;
                  }

                  if (transferStatusElement) {
                      transferStatusElement.textContent = 'Memproses transfer...';
                      transferStatusElement.classList.remove('success', 'error');
                      transferStatusElement.classList.add('loading');
                      transferStatusElement.style.display = 'block';
                  }
                  if (transferButton) transferButton.disabled = true;

                  try {
                      const response = await fetch(transferSaldoApiUrl, {
                          method: 'POST',
                          headers: {
                              'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                              recipientUsername: foundRecipient.username,
                              amount: amount,
                          }),
                      });

                      const data = await response.json();

                      if (response.ok && data.success) {
                          if (transferStatusElement) {
                              transferStatusElement.textContent = `Transfer berhasil! Saldo baru Anda: ${formatCurrency(data.newBalance)}. Ref ID: ${data.referenceId}`;
                              transferStatusElement.classList.remove('error', 'loading');
                              transferStatusElement.classList.add('success');
                          }

                          // Refresh user data after successful transfer to update balance
                          fetchUserData();
                          setTimeout(resetTransferForm, 5000);

                      } else {
                           const errorMessage = data.message || `Transfer gagal: Status ${response.status}`;
                           if (transferStatusElement) {
                              transferStatusElement.textContent = errorMessage;
                              transferStatusElement.classList.remove('success', 'loading');
                              transferStatusElement.classList.add('error');
                           }
                      }

                  } catch (error) {
                      console.error('Error transferring saldo:', error);
                       if (transferStatusElement) {
                          transferStatusElement.textContent = 'Gagal memproses transfer. Coba lagi.';
                          transferStatusElement.classList.remove('success', 'loading');
                          transferStatusElement.classList.add('error');
                       }
                  } finally {
                       if (transferButton) transferButton.disabled = false;
                  }
              });
          }

          if (togglePasswordButton && apiKeyInputs.length > 0) {
              togglePasswordButton.addEventListener('click', () => {
                   apiKeyInputs.forEach(input => {
                       const type = input.type === 'password' ? 'text' : 'password';
                       input.type = type;
                   });


                  const icon = togglePasswordButton.querySelector('i');
                  if (icon) {
                      icon.classList.toggle('fa-eye', apiKeyInputs[0].type === 'text');
                      icon.classList.toggle('fa-eye-slash', apiKeyInputs[0].type === 'password');
                      togglePasswordButton.setAttribute('aria-label', apiKeyInputs[0].type === 'text' ? 'Hide API Key' : 'Show API Key');
                  }
              });
          }

          if (copyApiKeyButton && apiKeyInputs.length > 0 && apiKeyStatusElement) {
              copyApiKeyButton.addEventListener('click', async () => {
                  const apiKey = apiKeyInputs[0].value;

                  if (!apiKey || apiKey === 'Loading...' || apiKey.includes('Error') || apiKey.includes('tidak ditemukan')) {
                       apiKeyStatusElement.textContent = 'Tidak ada API Key yang valid untuk disalin.';
                       apiKeyStatusElement.classList.remove('success', 'loading');
                       apiKeyStatusElement.classList.add('error');
                       apiKeyStatusElement.style.display = 'block';
                       return;
                  }

                  try {
                      await navigator.clipboard.writeText(apiKey);
                      apiKeyStatusElement.textContent = 'API Key berhasil disalin!';
                      apiKeyStatusElement.classList.remove('error', 'loading');
                      apiKeyStatusElement.classList.add('success');
                      apiKeyStatusElement.style.display = 'block';
                      setTimeout(() => {
                          apiKeyStatusElement.style.display = 'none';
                      }, 3000);
                  } catch (err) {
                      console.error('Gagal menyalin API Key:', err);
                      apiKeyStatusElement.textContent = 'Gagal menyalin API Key.';
                      apiKeyStatusElement.classList.remove('success', 'loading');
                      apiKeyStatusElement.classList.add('error');
                      apiKeyStatusElement.style.display = 'block';
                  }
              });
          }


           const savedTheme = localStorage.getItem('theme');
           if (savedTheme === 'dark') {
               document.body.classList.add('dark-mode');
           } else {
                document.body.classList.remove('dark-mode');
           }

           if (themeToggle) {
               const isDarkModeInitial = document.body.classList.contains('dark-mode');
               themeToggle.querySelector('i').classList.toggle('fa-moon', !isDarkModeInitial);
               themeToggle.querySelector('i').classList.toggle('fa-sun', isDarkModeInitial);
           }

          if (userMenuButton && userDropdown) {
               userMenuButton.addEventListener('click', (event) => {
                   event.stopPropagation();
                   userDropdown.classList.toggle('show');
               });

               document.addEventListener('click', (event) => {
                   if (!userDropdown.contains(event.target) && !userMenuButton.contains(event.target)) {
                       userDropdown.classList.remove('show');
                   }
               });
          }

          if (themeToggle) {
               themeToggle.addEventListener('click', () => {
                   document.body.classList.toggle('dark-mode');
                   const isDarkMode = document.body.classList.contains('dark-mode');
                   themeToggle.querySelector('i').classList.toggle('fa-moon', !isDarkMode);
                   themeToggle.querySelector('i').classList.toggle('fa-sun', isDarkMode);

                   userVerifyH2hIconElements.forEach(el => {
                       if (el.classList.contains('loading-state') || el.querySelector('.error-state')) {
                           el.style.color = isDarkMode ? 'var(--dark-text-secondary)' : 'var(--text-secondary)';
                       }
                   });

                   const usernameFeedbackElement = document.getElementById('usernameFeedback');
                    if (usernameFeedbackElement && usernameFeedbackElement.classList.contains('loading')) {
                        usernameFeedbackElement.style.color = 'var(--info)';
                    }

                     const apiKeyLoadingErrorElement = document.querySelector('#api-section .api-loading, #api-section .api-error');
                      if (apiKeyLoadingErrorElement) {
                          apiKeyLoadingErrorElement.style.color = isDarkMode ? 'var(--dark-text-secondary)' : 'var(--text-secondary)';
                      }


                   if (isDarkMode) {
                       localStorage.setItem('theme', 'dark');
                   } else {
                       localStorage.setItem('theme', 'light');
                   }
               });
          }

          if (scrollTopBtn) {
               window.addEventListener('scroll', () => {
                   if (window.scrollY > 300) {
                       scrollTopBtn.classList.add('show');
                   } else {
                       scrollTopBtn.classList.remove('show');
                   }

                   if (mainHeader && window.scrollY > 10) {
                       mainHeader.classList.add('scrolled');
                   } else if (mainHeader) {
                       mainHeader.classList.remove('scrolled');
                   }
               });

               scrollTopBtn.addEventListener('click', () => {
                   window.scrollTo({ top: 0, behavior: 'smooth' });
               });
          }

          if (sidebarToggle && sidebar && overlay && sidebarCloseBtn && appContainer && contentArea) {
              const desktopSidebarWidth = 250;
              const collapsedSidebarWidth = 80;

              function toggleSidebar() {
                  const isMobile = window.innerWidth <= 768;

                  if (isMobile) {
                      sidebar.classList.toggle('open');
                      overlay.classList.toggle('show');
                  } else {
                      sidebar.classList.toggle('closed');
                      const isClosed = sidebar.classList.contains('closed');

                      contentArea.style.marginLeft = isClosed ? `${collapsedSidebarWidth}px` : `${desktopSidebarWidth}px`;
                      contentArea.classList.toggle('content-area-full', isClosed);

                       const toggleIcon = sidebarToggle.querySelector('i');
                       if (toggleIcon) {
                           if (isClosed) {
                               toggleIcon.classList.remove('fa-bars');
                               toggleIcon.classList.add('fa-arrow-right');
                           } else {
                                toggleIcon.classList.remove('fa-arrow-right');
                                toggleIcon.classList.add('fa-bars');
                           }
                       }
                       sidebarToggle.setAttribute('aria-label', isClosed ? 'Expand sidebar' : 'Collapse sidebar');
                       localStorage.setItem('sidebarState', isClosed ? 'closed' : 'open');
                  }
              }

              function updateLayout() {
                  const isMobile = window.innerWidth <= 768;
                  const isSidebarOpen = sidebar.classList.contains('open');
                  const isSidebarClosedDesktop = sidebar.classList.contains('closed');

                   const toggleIcon = sidebarToggle.querySelector('i');


                  if (!isMobile) {
                       sidebar.classList.remove('open');
                       overlay.classList.remove('show');

                       sidebarToggle.style.display = 'flex';
                       sidebarCloseBtn.style.display = 'none';

                       contentArea.style.marginLeft = isSidebarClosedDesktop ? `${collapsedSidebarWidth}px` : `${desktopSidebarWidth}px`;
                       contentArea.classList.toggle('content-area-full', isSidebarClosedDesktop);

                       if (toggleIcon) {
                           toggleIcon.classList.remove('fa-bars', 'fa-arrow-right');
                           toggleIcon.classList.add(isSidebarClosedDesktop ? 'fa-arrow-right' : 'fa-bars');
                       }
                       sidebarToggle.setAttribute('aria-label', isSidebarClosedDesktop ? 'Expand sidebar' : 'Collapse sidebar');


                  } else {
                       sidebar.classList.remove('closed');
                       contentArea.style.marginLeft = '0';
                       contentArea.classList.remove('content-area-full');

                       sidebarToggle.style.display = 'flex';
                       sidebarCloseBtn.style.display = 'block';

                       if (isSidebarOpen) {
                           overlay.classList.add('show');
                       } else {
                           overlay.classList.remove('show');
                       }

                       if (toggleIcon) {
                           toggleIcon.classList.remove('fa-bars', 'fa-arrow-right');
                           toggleIcon.classList.add('fa-bars');
                       }
                        sidebarToggle.setAttribute('aria-label', 'Open sidebar');
                  }
              }


              sidebarToggle.addEventListener('click', toggleSidebar);
              sidebarCloseBtn.addEventListener('click', toggleSidebar);
              overlay.addEventListener('click', toggleSidebar);

              updateLayout();
              window.addEventListener('resize', updateLayout);

               const savedSidebarState = localStorage.getItem('sidebarState');
               if (savedSidebarState === 'closed' && window.innerWidth > 768) {
                   sidebar.classList.add('closed');
                   contentArea.style.marginLeft = `${collapsedSidebarWidth}px`;
                   contentArea.classList.add('content-area-full');
                    const toggleIcon = sidebarToggle.querySelector('i');
                    if (toggleIcon) {
                        toggleIcon.classList.remove('fa-bars', 'fa-arrow-right');
                         toggleIcon.classList.add('fa-arrow-right');
                     }
                    sidebarToggle.setAttribute('aria-label', 'Expand sidebar');
               } else if (window.innerWidth > 768) {
                   sidebar.classList.remove('closed');
                   contentArea.style.marginLeft = `${desktopSidebarWidth}px`;
                   contentArea.classList.remove('content-area-full');
                    const toggleIcon = sidebarToggle.querySelector('i');
                     if (toggleIcon) {
                         toggleIcon.classList.remove('fa-bars', 'fa-arrow-right');
                         toggleIcon.classList.add('fa-bars');
                     }
                    sidebarToggle.setAttribute('aria-label', 'Collapse sidebar');
               }
          }

          if (infoBanner) {
              const closeBtn = infoBanner.querySelector('.close-btn');
              if (closeBtn) {
                  closeBtn.addEventListener('click', () => {
                      infoBanner.style.display = 'none';
                  });
              }
          }

           if (searchInput) {
               searchInput.addEventListener('input', () => {
                   const searchTerm = searchInput.value.toLowerCase().trim();

                   const activeSection = document.querySelector('main > section.active-content');
                   if (!activeSection) return;

                   let elementsToSearch = [];

                   if (activeSection.id === 'dashboard-summary') {
                        elementsToSearch = activeSection.querySelectorAll('.card .label, .card .value, .history-item, .info-banner');
                   } else if (activeSection.id === 'transfer-section') {
                       elementsToSearch = activeSection.querySelectorAll('#transferForm input, #transfer-section .recipient-info, #transfer-section .transfer-status, #transfer-section .card .label, #transfer-section .card .value, #transfer-section .form-text, #transfer-section h2');
                   } else if (activeSection.id === 'mutation-section') {
                       elementsToSearch = activeSection.querySelectorAll('#mutationTable thead th, #mutationTable tbody tr, #mutation-section h2, #mutationTable .mutation-empty, #mutationTable .mutation-loading, #mutationTable .mutation-error');
                   } else if (activeSection.id === 'api-section') {
                       elementsToSearch = activeSection.querySelectorAll('.api-key-card input, .api-key-card .copy-button, .api-key-card .api-status, .api-key-card h3, .api-key-card .api-loading, .api-key-card .api-error');
                   } else {
                       elementsToSearch = activeSection.querySelectorAll('h2, h3, p, div, span, a, button, input, label, table, thead, tbody, tr, th, td');
                   }


                    elementsToSearch = [...elementsToSearch, ...document.querySelectorAll('aside nav a[href^="#"], aside .bottom a')]; // Only internal links in sidebar nav
                    elementsToSearch = [...elementsToSearch, ...document.querySelectorAll('#userDropdown nav a')];
                    elementsToSearch = [...elementsToSearch, ...document.querySelectorAll('footer a, footer p, footer h3, footer .contact-item span')];


                   elementsToSearch.forEach(element => {
                       let textContent = element.textContent ? element.textContent.toLowerCase() : '';
                        if (element.classList.contains('card') || element.classList.contains('summary-card')) {
                              const labelText = element.querySelector('.label')?.textContent?.toLowerCase() || '';
                              const valueText = element.querySelector('.value')?.textContent?.toLowerCase() || '';
                              textContent = labelText + ' ' + valueText;
                        } else if (element.classList.contains('history-item')) {
                              const activityText = element.querySelector('.activity')?.textContent?.toLowerCase() || '';
                              const codeDateText = element.querySelector('.code-date')?.textContent?.toLowerCase() || '';
                              const amountText = element.querySelector('.amount')?.textContent?.toLowerCase() || '';
                              textContent = activityText + ' ' + codeDateText + ' ' + amountText;
                        } else if (element.closest('#mutationTable tbody tr')) {
                            const cells = element.querySelectorAll('td');
                             textContent = Array.from(cells).map(cell => cell.textContent?.toLowerCase() || '').join(' ');
                        }


                       const isMatch = textContent.includes(searchTerm);

                       let elementToToggle = element;

                       if (element.tagName === 'A' && element.closest('footer li')) {
                           elementToToggle = element.closest('footer li');
                       } else if (element.classList.contains('info-banner')) {
                           elementToToggle = element;
                       } else if (element.classList.contains('history-item')) {
                           elementToToggle = element;
                       } else if (element.closest('.form-group')) {
                           elementToToggle = element.closest('.form-group');
                       } else if (element.classList.contains('recipient-info')) {
                            elementToToggle = element;
                       } else if (element.classList.contains('transfer-status')) {
                           elementToToggle = element;
                       } else if (element.tagName === 'TR' && element.closest('#mutationTable tbody')) {
                           elementToToggle = element;
                       } else if (element.closest('.api-key-card')) {
                            if (element.tagName === 'INPUT' || element.tagName === 'BUTTON' || element.tagName === 'H3' || element.classList.contains('api-status') || element.classList.contains('api-loading') || element.classList.contains('api-error')) {
                                 elementToToggle = element;
                             } else {
                                 return;
                             }
                       } else if (element.classList.contains('card') || element.classList.contains('summary-card')) {
                            elementToToggle = element;
                       } else if (element.classList.contains('contact-item')) {
                           elementToToggle = element;
                       } else if (element.tagName === 'A' && element.closest('aside nav') && element.getAttribute('href').startsWith('#')) {
                           elementToToggle = element;
                       } else if (element.tagName === 'A' && element.closest('aside .bottom')) {
                           elementToToggle = element;
                       } else if (element.tagName === 'A' && element.closest('#userDropdown nav')) {
                           elementToToggle = element;
                       }


                       if (searchTerm === '') {
                           elementToToggle.style.display = '';
                            if (elementToToggle.classList.contains('info-banner')) {
                               elementToToggle.style.display = 'flex';
                            }
                            if (elementToToggle.classList.contains('history-item')) {
                               elementToToggle.style.display = 'flex';
                            }
                            if (elementToToggle.classList.contains('form-group')) {
                                 elementToToggle.style.display = 'flex';
                            }
                             if (elementToToggle.classList.contains('recipient-info')) {
                                 elementToToggle.style.display = 'flex';
                             }
                             if (elementToToggle.classList.contains('transfer-status')) {
                                 // Keep hidden if not active status
                             }
                              if (elementToToggle.tagName === 'TR' && elementToToggle.closest('#mutationTable tbody')) {
                                   elementToToggle.style.display = 'table-row';
                              }
                               if (elementToToggle.classList.contains('api-status')) {
                                   // Keep hidden if not active status
                               }
                              if (elementToToggle.classList.contains('card') || elementToToggle.classList.contains('summary-card')) {
                                  elementToToggle.style.display = '';
                              }
                               if (elementToToggle.classList.contains('contact-item')) {
                                   elementToToggle.style.display = 'flex';
                               }


                       } else {
                           if (isMatch) {
                               elementToToggle.style.display = '';
                                if (elementToToggle.classList.contains('info-banner')) {
                                   elementToToggle.style.display = 'flex';
                                }
                                if (elementToToggle.classList.contains('history-item')) {
                                   elementToToggle.style.display = 'flex';
                                }
                                 if (elementToToggle.classList.contains('form-group')) {
                                     elementToToggle.style.display = 'flex';
                                 }
                                  if (elementToToggle.classList.contains('recipient-info')) {
                                      elementToToggle.style.display = 'flex';
                                  }
                                  if (elementToToggle.classList.contains('transfer-status')) {
                                       if (elementToToggle.style.display !== 'none') {
                                            elementToToggle.style.display = 'block';
                                       } else {
                                           elementToToggle.style.display = 'none';
                                       }
                                  }
                                  if (elementToToggle.tagName === 'TR' && elementToToggle.closest('#mutationTable tbody')) {
                                       elementToToggle.style.display = 'table-row';
                                  }
                                   if (elementToToggle.classList.contains('api-status')) {
                                       if (elementToToggle.style.display !== 'none') {
                                            elementToToggle.style.display = 'block';
                                       } else {
                                           elementToToggle.style.display = 'none';
                                       }
                                  }
                                  if (elementToToggle.classList.contains('card') || elementToToggle.classList.contains('summary-card')) {
                                      elementToToggle.style.display = '';
                                  }
                                   if (elementToToggle.classList.contains('contact-item')) {
                                       elementToToggle.style.display = 'flex';
                                   }


                           } else {
                               elementToToggle.style.display = 'none';
                           }
                       }
                   });

                   document.querySelectorAll('footer ul').forEach(ul => {
                       const listItems = ul.querySelectorAll('li');
                       let allHidden = true;
                       listItems.forEach(li => {
                           if (li.style.display !== 'none') {
                               allHidden = false;
                           }
                       });
                       ul.style.display = allHidden && searchTerm !== '' ? 'none' : '';
                   });

                    const sidebarNavInternalLinks = document.querySelectorAll('aside nav a[href^="#"]');
                    if (sidebarNavInternalLinks.length > 0) {
                        let allNavHidden = true;
                        sidebarNavInternalLinks.forEach(link => {
                            if (link.style.display !== 'none') {
                                allNavHidden = false;
                            }
                        });
                        const parentNav = sidebarNavInternalLinks[0].closest('nav');
                         if (parentNav) {
                              if (searchTerm !== '') parentNav.style.display = allNavHidden ? 'none' : '';
                              else parentNav.style.display = '';
                         }
                    }

                    const sidebarBottomLinks = document.querySelectorAll('aside .bottom a');
                     if (sidebarBottomLinks.length > 0) {
                        let allBottomHidden = true;
                        sidebarBottomLinks.forEach(link => {
                            if (link.style.display !== 'none') {
                                allBottomHidden = false;
                            }
                        });
                         const parentBottom = sidebarBottomLinks[0].closest('.bottom');
                          if (parentBottom) {
                               if (searchTerm !== '') parentBottom.style.display = allBottomHidden ? 'none' : '';
                               else parentBottom.style.display = '';
                          }
                    }


                    const historyList = document.getElementById('historyList');
                     if (historyList) {
                         const historyItems = historyList.querySelectorAll('.history-item, .loading-state, .error-state');
                         let allHistoryHidden = true;
                         historyItems.forEach(item => {
                             if (item.style.display !== 'none') {
                                 allHistoryHidden = false;
                             }
                         });
                          const historySection = historyList.closest('.history-section');
                         if (historySection) {
                             if (searchTerm !== '') historySection.style.display = allHistoryHidden ? 'none' : '';
                             else historySection.style.display = '';
                         }
                     }

                      const mutationTableBody = document.querySelector('#mutationTable tbody');
                      if (mutationTableBody) {
                           const mutationRows = mutationTableBody.querySelectorAll('tr');
                           let allRowsHidden = true;
                           mutationRows.forEach(row => {
                                if (row.style.display !== 'none') {
                                    allRowsHidden = false;
                                }
                           });
                          const mutationTableContainer = mutationTableBody.closest('.mutation-table-container');
                          if (mutationTableContainer) {
                              if (searchTerm !== '') mutationTableContainer.style.display = allRowsHidden ? 'none' : '';
                              else mutationTableContainer.style.display = '';
                          }
                      }

                    document.querySelectorAll('.api-key-card').forEach(card => {
                         const elementsInCard = card.querySelectorAll('input, button, h3, .api-status, .api-loading, .api-error');
                         let anyElementVisible = false;
                         elementsInCard.forEach(el => {
                             if (el.style.display !== 'none') {
                                 anyElementVisible = true;
                             }
                         });
                         if (searchTerm !== '') card.style.display = anyElementVisible ? '' : 'none';
                         else card.style.display = '';
                    });


               });
           }


           const currentYearElement = document.getElementById('currentYear');
           if (currentYearElement) {
               currentYearElement.textContent = new Date().getFullYear();
           }

          fetchUserData();
          resetTransferForm();
      });
