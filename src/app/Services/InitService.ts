import { Injectable } from '@angular/core';
import { CheckService } from './CheckService';
import { AuthApiService } from './AuthApiService';
import { Router } from '@angular/router';
import { MessageService } from './MessageService';
import { Values } from '../values';
import { CacheService } from './CacheService';
import { ConversationApiService } from './ConversationApiService';
import { AngularFireMessaging } from '@angular/fire/messaging';
import { mergeMapTo } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class InitService {
    private interval;

    constructor(
        private checkService: CheckService,
        private authApiService: AuthApiService,
        private router: Router,
        private messageService: MessageService,
        private cacheService: CacheService,
        private conversationApiService: ConversationApiService,
        private afMessaging: AngularFireMessaging) {
    }

    public init(): void {
        this.checkService.checkVersion(false);
        this.authApiService.SignInStatus().subscribe(signInStatus => {
            if (signInStatus.value === false) {
                this.router.navigate(['/signin'], {replaceUrl: true});
            } else {
                this.authApiService.Me().subscribe(p => {
                    if (p.code === 0) {
                        this.messageService.me = p.value;
                        this.messageService.me.avatarURL = Values.fileAddress + p.value.headImgFileKey;
                        this.cacheService.autoUpdateConversation();
                        this.interval = setInterval(this.resend, 3000);

                        this.afMessaging.requestPermission
                        .pipe(mergeMapTo(this.afMessaging.tokenChanges))
                        .subscribe(() => {}, (error) => { console.error(error); });

                        if ('serviceWorker' in navigator) {
                            navigator.serviceWorker.register('/firebase-messaging-sw.js')
                            .then(function() {
                              console.log('Service worker successfully registered.');
                            })
                            .catch(function(err) {
                              console.error('Unable to register service worker.', err);
                            });
                        }

                        this.afMessaging.messaging.subscribe(messaging => {
                            messaging.onMessage(payload => {
                                if ('Notification' in window && Notification['permission'] === 'granted') {
                                    if ('serviceWorker' in navigator) {
                                        navigator.serviceWorker.ready.then(function (serviceWorkerRegistration) {
                                            serviceWorkerRegistration.showNotification(payload.notification.title, {
                                                body: payload.notification.body
                                            });
                                        });
                                    } else {
                                        const _notify = new Notification(payload.notification.title, {
                                            body: payload.notification.body
                                        });
                                    }
                                }
                            });
                        });
                    }
                });
            }
        });
    }

    public destroy(): void {
        clearInterval(this.interval);
        this.messageService.resetVariables();
        this.cacheService.reset();
        this.messageService.me = null;
    }

    private resend(): void {
        if (navigator.onLine) {
            const unsentMessages = new Map(JSON.parse(localStorage.getItem('unsentMessages')));
            unsentMessages.forEach((messages, id) => {
                const sendFailMessages = [];
                for (let i = 0; i < (<Array<string>>messages).length; i++) {
                    setTimeout(() => {
                        this.conversationApiService.SendMessage(Number(id), (<Array<string>>messages)[i]).subscribe(() => {}, () => {
                            sendFailMessages.push((<Array<string>>messages)[i]);
                        });
                    }, 500);
                }
                unsentMessages.set(id, sendFailMessages);
                localStorage.setItem('unsentMessages', JSON.stringify(Array.from(unsentMessages)));
            });
        }
    }
}
